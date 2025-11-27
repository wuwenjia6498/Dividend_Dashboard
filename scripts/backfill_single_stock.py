"""
Backfill Historical Data for a Single Stock
Optimized for quick single-stock data loading
"""
import os
import sys
import time
import argparse
from datetime import datetime, timedelta
from pathlib import Path
import tushare as ts
import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import execute_batch
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# Configuration
REQUEST_DELAY = 0.5
HISTORY_YEARS = 5
MAX_RETRIES = 3
RETRY_DELAY = 3.0

# Initialize Tushare
TUSHARE_TOKEN = os.getenv("TUSHARE_TOKEN")
if not TUSHARE_TOKEN:
    raise ValueError("TUSHARE_TOKEN not found")

pro = ts.pro_api(TUSHARE_TOKEN)


def get_connection():
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return psycopg2.connect(database_url)
    return psycopg2.connect(
        host=os.getenv("DATABASE_HOST", "localhost"),
        port=os.getenv("DATABASE_PORT", "5432"),
        database=os.getenv("DATABASE_NAME", "dividend_dashboard"),
        user=os.getenv("DATABASE_USER", "postgres"),
        password=os.getenv("DATABASE_PASSWORD", ""),
    )


def convert_symbol_to_ts_code(symbol: str) -> str:
    if symbol.startswith('6'):
        return f"{symbol}.SH"
    elif symbol.startswith('0') or symbol.startswith('3'):
        return f"{symbol}.SZ"
    else:
        return f"{symbol}.SH"


def fetch_with_retry(func, *args, max_retries=MAX_RETRIES, delay=RETRY_DELAY, **kwargs):
    last_exception = None
    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            last_exception = e
            if attempt < max_retries - 1:
                print(f"  [RETRY] {delay}秒后重试...")
                time.sleep(delay)
    raise last_exception


def fetch_historical_daily_basic(ts_code: str, start_date: str, end_date: str) -> pd.DataFrame:
    """Fetch historical daily basic data"""
    try:
        df = fetch_with_retry(
            pro.daily_basic,
            ts_code=ts_code,
            start_date=start_date,
            end_date=end_date,
            fields='ts_code,trade_date,close,pe_ttm,pb,dv_ttm,total_mv'
        )

        if df.empty:
            return pd.DataFrame()

        df = df.sort_values('trade_date')
        df['dv_ttm'] = df['dv_ttm'].replace(0, np.nan).ffill()
        df['pe_ttm'] = df['pe_ttm'].replace(0, np.nan).ffill()

        return df
    except Exception as e:
        print(f"  [ERROR] {e}")
        return pd.DataFrame()


def calculate_percentiles(df: pd.DataFrame, current_idx: int):
    """Calculate percentiles for a specific row"""
    if df.empty or current_idx < 0:
        return None, None

    # Get historical data up to current point
    hist_data = df.iloc[:current_idx + 1]

    # Yield percentile
    yield_percentile = None
    if pd.notna(df.iloc[current_idx]['dv_ttm']):
        current_yield = float(df.iloc[current_idx]['dv_ttm'])
        hist_yields = hist_data['dv_ttm'].dropna()
        hist_yields = hist_yields[(hist_yields > 0) & (hist_yields < 100)]

        if len(hist_yields) > 0:
            yield_percentile = float((np.sum(hist_yields <= current_yield) / len(hist_yields)) * 100)

    # PE percentile
    pe_percentile = None
    if pd.notna(df.iloc[current_idx]['pe_ttm']):
        current_pe = float(df.iloc[current_idx]['pe_ttm'])
        hist_pes = hist_data['pe_ttm'].dropna()
        hist_pes = hist_pes[(hist_pes > 0) & (hist_pes < 1000)]

        if len(hist_pes) > 0:
            pe_percentile = float((np.sum(hist_pes >= current_pe) / len(hist_pes)) * 100)

    return yield_percentile, pe_percentile


def backfill_single_stock(conn, symbol: str, name: str) -> int:
    """Backfill historical data for a single stock"""
    print(f"\nBackfilling {symbol} ({name})...")

    ts_code = convert_symbol_to_ts_code(symbol)
    print(f"  Tushare code: {ts_code}")

    # Calculate date range
    end_date = datetime.now().strftime("%Y%m%d")
    start_date = (datetime.now() - timedelta(days=HISTORY_YEARS * 365)).strftime("%Y%m%d")

    print(f"  Fetching data from {start_date} to {end_date}...")

    # Fetch data
    df = fetch_historical_daily_basic(ts_code, start_date, end_date)

    if df.empty:
        print(f"  [WARN] No data for {symbol}")
        return 0

    print(f"  Fetched {len(df)} records")

    # Prepare upsert SQL
    upsert_sql = """
        INSERT INTO daily_metrics (
            symbol, trade_date, close_price, market_cap,
            pe_ttm, pb_ttm, dividend_yield_ttm,
            pe_percentile, pb_percentile, yield_percentile
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (symbol, trade_date) DO UPDATE SET
            close_price = EXCLUDED.close_price,
            market_cap = EXCLUDED.market_cap,
            pe_ttm = EXCLUDED.pe_ttm,
            pb_ttm = EXCLUDED.pb_ttm,
            dividend_yield_ttm = EXCLUDED.dividend_yield_ttm,
            pe_percentile = EXCLUDED.pe_percentile,
            pb_percentile = EXCLUDED.pb_percentile,
            yield_percentile = EXCLUDED.yield_percentile
    """

    # Prepare all data for batch insert
    print(f"  Preparing data for batch insert...")
    batch_data = []

    for idx, row in df.iterrows():
        trade_date = pd.to_datetime(row['trade_date']).strftime('%Y-%m-%d')

        # Calculate percentiles
        yield_percentile, pe_percentile = calculate_percentiles(df, df.index.get_loc(idx))

        # Convert to Python native types
        def to_python_type(val):
            if val is None or pd.isna(val):
                return None
            if isinstance(val, (np.integer, np.floating)):
                return float(val)
            return val

        # Calculate market cap in 亿 (hundred million)
        market_cap = None
        if pd.notna(row['total_mv']):
            market_cap = to_python_type(row['total_mv']) / 10000

        batch_data.append((
            symbol,
            trade_date,
            to_python_type(row['close']),
            market_cap,
            to_python_type(row['pe_ttm']),
            to_python_type(row['pb']),
            to_python_type(row['dv_ttm']),
            to_python_type(pe_percentile),
            None,
            to_python_type(yield_percentile),
        ))

    # Batch insert all data
    print(f"  Inserting {len(batch_data)} records in batch...")
    saved_count = 0

    with conn.cursor() as cur:
        # Use execute_batch for much faster bulk insert
        execute_batch(cur, upsert_sql, batch_data, page_size=100)
        saved_count = len(batch_data)
        conn.commit()

    print(f"  [OK] Saved {saved_count} records for {symbol}")
    return saved_count


def main():
    parser = argparse.ArgumentParser(description="Backfill single stock historical data")
    parser.add_argument('--symbol', type=str, required=True, help='Stock symbol (e.g., 600519)')
    args = parser.parse_args()

    symbol = args.symbol

    print("=" * 60)
    print(f"Single Stock Historical Data Backfill")
    print(f"Symbol: {symbol}")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    try:
        conn = get_connection()
        print("Connected to database.\n")

        # Get stock info
        with conn.cursor() as cur:
            cur.execute(
                "SELECT symbol, name FROM stock_meta WHERE symbol = %s AND is_active = true",
                (symbol,)
            )
            result = cur.fetchone()

        if not result:
            print(f"[ERROR] Stock {symbol} not found or inactive")
            sys.exit(1)

        stock_symbol, stock_name = result

        # Backfill
        saved = backfill_single_stock(conn, stock_symbol, stock_name)

        conn.close()

        print("\n" + "=" * 60)
        print(f"Backfill Complete! Saved {saved} records")
        print(f"Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 60)

    except Exception as e:
        print(f"[FATAL] {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
