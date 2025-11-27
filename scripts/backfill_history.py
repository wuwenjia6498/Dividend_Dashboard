"""
Backfill Historical Data Script
Fetches historical daily_basic data from Tushare and fills the daily_metrics table
"""
import os
import time
from datetime import datetime, timedelta
from pathlib import Path
import tushare as ts
import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# Configuration
REQUEST_DELAY = 0.5  # seconds between API requests
HISTORY_YEARS = 5    # years of historical data to backfill (per PRD requirement)
MAX_RETRIES = 3
RETRY_DELAY = 3.0

# Initialize Tushare Pro API
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
                print(f"  [RETRY] 请求失败，{delay}秒后重试 (第 {attempt + 1}/{max_retries} 次)...")
                print(f"  [RETRY] 错误信息: {str(e)}")
                time.sleep(delay)
            else:
                print(f"  [FAIL] 已达到最大重试次数 ({max_retries} 次)，放弃该请求")
    raise last_exception


def fetch_historical_daily_basic(ts_code: str, start_date: str, end_date: str) -> pd.DataFrame:
    """Fetch historical daily basic data from Tushare"""
    try:
        df = fetch_with_retry(
            pro.daily_basic,
            ts_code=ts_code,
            start_date=start_date,
            end_date=end_date,
            fields='ts_code,trade_date,close,pe_ttm,pb,dv_ttm,total_mv'
        )

        if df.empty:
            print(f"  [WARN] No data for {ts_code} from {start_date} to {end_date}")
            return pd.DataFrame()

        # Sort by trade_date to ensure proper forward fill
        df = df.sort_values('trade_date')

        # Data smoothing: Forward fill None and 0 values in dv_ttm
        # Replace 0 with NaN for forward fill
        df['dv_ttm'] = df['dv_ttm'].replace(0, np.nan)
        # Forward fill NaN values (use previous valid value)
        df['dv_ttm'] = df['dv_ttm'].ffill()

        # Similarly smooth pe_ttm for payout ratio calculation
        df['pe_ttm'] = df['pe_ttm'].replace(0, np.nan)
        df['pe_ttm'] = df['pe_ttm'].ffill()

        return df

    except Exception as e:
        print(f"  [ERROR] Failed to fetch historical data for {ts_code}: {e}")
        return pd.DataFrame()


def calculate_yield_percentile(current_yield: float, historical_yields: pd.Series) -> float:
    if historical_yields.empty or current_yield is None or current_yield <= 0:
        return None

    try:
        yields = historical_yields.dropna()
        yields = yields[yields < 100]
        yields = yields[yields > 0]

        if len(yields) == 0:
            return None

        percentile = (np.sum(yields <= current_yield) / len(yields)) * 100
        return float(round(percentile, 2))

    except Exception as e:
        return None


def calculate_pe_percentile(current_pe: float, historical_pe: pd.Series) -> float:
    if historical_pe.empty or current_pe is None or current_pe <= 0:
        return None

    try:
        pe_values = historical_pe.dropna()
        pe_values = pe_values[pe_values > 0]
        pe_values = pe_values[pe_values < 1000]

        if len(pe_values) == 0:
            return None

        percentile = (np.sum(pe_values <= current_pe) / len(pe_values)) * 100
        return float(round(percentile, 2))

    except Exception as e:
        return None


def to_python_type(val):
    """Convert NumPy/Pandas types to Python native types"""
    if val is None or pd.isna(val):
        return None
    if isinstance(val, (np.integer, np.floating)):
        return float(val)
    return val


def backfill_stock_history(conn, symbol: str, name: str):
    """Backfill historical data for a single stock"""
    print(f"\nBackfilling {symbol} ({name})...")

    ts_code = convert_symbol_to_ts_code(symbol)
    print(f"  Tushare code: {ts_code}")

    # Calculate date range
    end_date = datetime.now()
    start_date = end_date - timedelta(days=HISTORY_YEARS * 365)

    start_date_str = start_date.strftime("%Y%m%d")
    end_date_str = end_date.strftime("%Y%m%d")

    print(f"  Fetching data from {start_date_str} to {end_date_str}...")

    # Fetch historical data
    df = fetch_historical_daily_basic(ts_code, start_date_str, end_date_str)

    if df.empty:
        print(f"  [SKIP] No historical data available for {symbol}")
        return 0

    print(f"  Fetched {len(df)} records")

    # Sort by trade_date ascending
    df = df.sort_values('trade_date')

    # Calculate percentiles for each record
    saved_count = 0

    with conn.cursor() as cur:
        for idx, row in df.iterrows():
            trade_date_raw = str(row['trade_date'])
            trade_date = f"{trade_date_raw[:4]}-{trade_date_raw[4:6]}-{trade_date_raw[6:8]}"

            # Get all historical data up to this point for percentile calculation
            historical_data = df[df['trade_date'] <= row['trade_date']]

            # Calculate percentiles
            yield_percentile = None
            pe_percentile = None

            if pd.notna(row['dv_ttm']) and row['dv_ttm'] > 0:
                yield_percentile = calculate_yield_percentile(
                    row['dv_ttm'], historical_data['dv_ttm']
                )

            if pd.notna(row['pe_ttm']) and row['pe_ttm'] > 0:
                pe_percentile = calculate_pe_percentile(
                    row['pe_ttm'], historical_data['pe_ttm']
                )

            # Insert/update record
            upsert_sql = """
                INSERT INTO daily_metrics (
                    symbol, trade_date, close_price, market_cap,
                    pe_ttm, pb_ttm, dividend_yield_ttm,
                    pe_percentile, pb_percentile, yield_percentile
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
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

            # Calculate market cap in 亿 (hundred million)
            market_cap = None
            if pd.notna(row['total_mv']):
                market_cap = to_python_type(row['total_mv']) / 10000

            cur.execute(upsert_sql, (
                symbol,
                trade_date,
                to_python_type(row['close']),
                market_cap,
                to_python_type(row['pe_ttm']),
                to_python_type(row['pb']),
                to_python_type(row['dv_ttm']),
                to_python_type(pe_percentile),
                None,  # pb_percentile
                to_python_type(yield_percentile),
            ))

            saved_count += 1

        conn.commit()

    print(f"  [OK] Saved {saved_count} records for {symbol}")
    return saved_count


def main():
    print("=" * 60)
    print("Historical Data Backfill Script")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    try:
        conn = get_connection()
        print("Connected to database.")

        # Get active stocks
        with conn.cursor() as cur:
            cur.execute("SELECT symbol, name FROM stock_meta WHERE is_active = true")
            stocks = cur.fetchall()

        if not stocks:
            print("No active stocks found.")
            return

        print(f"\nFound {len(stocks)} active stocks to backfill.")

        total_saved = 0
        for symbol, name in stocks:
            try:
                saved = backfill_stock_history(conn, symbol, name)
                total_saved += saved
            except Exception as e:
                print(f"  [ERROR] Failed to backfill {symbol}: {e}")
                import traceback
                traceback.print_exc()

            # Rate limiting
            time.sleep(REQUEST_DELAY)

        print("\n" + "=" * 60)
        print(f"Backfill Complete! Total records saved: {total_saved}")
        print(f"Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 60)

        conn.close()

    except Exception as e:
        print(f"[FATAL] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        raise


if __name__ == "__main__":
    main()
