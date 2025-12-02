"""
Data Update Script for Dividend Dashboard - Tushare Version
ETL pipeline: Fetch stock data from Tushare Pro, calculate metrics, and store to database.

Usage:
  python update_data.py              # Update all active stocks
  python update_data.py --symbol 600519  # Update only specified stock
"""

import os
import sys
import time
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from decimal import Decimal

import tushare as ts
import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# Default seed stocks (high-dividend classics)
SEED_STOCKS = [
    {"symbol": "601088", "name": "中国神华", "sector": "煤炭"},
    {"symbol": "600036", "name": "招商银行", "sector": "银行"},
    {"symbol": "600900", "name": "长江电力", "sector": "公用事业"},
]

# Configuration
REQUEST_DELAY = 0.5  # seconds between API requests (Tushare is more stable)
HISTORY_YEARS = 5    # years of historical data for percentile calculation
MAX_RETRIES = 3      # maximum retry attempts for failed requests
RETRY_DELAY = 3.0    # seconds to wait between retries

# Initialize Tushare Pro API
TUSHARE_TOKEN = os.getenv("TUSHARE_TOKEN")
if not TUSHARE_TOKEN:
    raise ValueError("TUSHARE_TOKEN not found in environment variables. Please set it in .env file.")

pro = ts.pro_api(TUSHARE_TOKEN)


def get_connection():
    """Create database connection from environment variables."""
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


def fetch_with_retry(func, *args, max_retries=MAX_RETRIES, delay=RETRY_DELAY, **kwargs):
    """
    Wrapper function to retry API calls that may fail due to network issues.

    Args:
        func: The function to call
        *args: Positional arguments to pass to func
        max_retries: Maximum number of retry attempts (default: 3)
        delay: Seconds to wait between retries (default: 3)
        **kwargs: Keyword arguments to pass to func

    Returns:
        The result of func if successful, or raises the last exception after all retries fail
    """
    last_exception = None

    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            last_exception = e
            if attempt < max_retries - 1:  # Don't sleep on the last attempt
                print(f"  [RETRY] 请求失败，{delay}秒后重试 (第 {attempt + 1}/{max_retries} 次)...")
                print(f"  [RETRY] 错误信息: {str(e)}")
                time.sleep(delay)
            else:
                print(f"  [FAIL] 已达到最大重试次数 ({max_retries} 次)，放弃该请求")

    # If we get here, all retries failed
    raise last_exception


def convert_symbol_to_ts_code(symbol: str) -> str:
    """
    Convert stock symbol to Tushare ts_code format.
    600036 -> 600036.SH
    000651 -> 000651.SZ
    """
    if symbol.startswith('6'):
        return f"{symbol}.SH"
    elif symbol.startswith('0') or symbol.startswith('3'):
        return f"{symbol}.SZ"
    else:
        # Default to SH
        return f"{symbol}.SH"


def seed_stock_pool(conn):
    """
    Initialize stock pool if empty.
    Inserts default high-dividend stocks for testing.
    """
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM stock_meta")
        count = cur.fetchone()[0]

        if count == 0:
            print("Stock pool is empty. Seeding with default stocks...")
            insert_sql = """
                INSERT INTO stock_meta (symbol, name, sector, is_active)
                VALUES (%s, %s, %s, true)
                ON CONFLICT (symbol) DO NOTHING
            """
            for stock in SEED_STOCKS:
                cur.execute(insert_sql, (stock["symbol"], stock["name"], stock["sector"]))
            conn.commit()
            print(f"Seeded {len(SEED_STOCKS)} stocks into stock_meta.")
        else:
            print(f"Stock pool already has {count} stocks. Skipping seed.")


def get_active_stocks(conn):
    """Fetch all active stocks from database."""
    with conn.cursor() as cur:
        cur.execute("SELECT symbol, name FROM stock_meta WHERE is_active = true")
        return cur.fetchall()


def fetch_daily_basic(ts_code: str, trade_date: str = None) -> dict:
    """
    Fetch daily basic data from Tushare (stock price, PE, PB, dividend yield, etc.)
    This is the most important interface - it has everything we need!

    Returns:
        dict with close_price, market_cap, pe_ttm, pb_ttm, dividend_yield_ttm
    """
    try:
        # Get latest trading day data (don't specify trade_date to get most recent)
        # Tushare will automatically return the latest available trading day
        df = fetch_with_retry(
            pro.daily_basic,
            ts_code=ts_code,
            fields='ts_code,trade_date,close,pe_ttm,pb,dv_ttm,total_mv'
        )

        if df.empty:
            print(f"  [WARN] No daily_basic data for {ts_code}")
            return None

        row = df.iloc[0]
        actual_trade_date = row['trade_date']
        print(f"  Latest trade date: {actual_trade_date}")

        # Calculate payout ratio using formula: payout_ratio = pe_ttm * (dv_ttm / 100)
        payout_ratio = None
        if pd.notna(row['pe_ttm']) and pd.notna(row['dv_ttm']) and row['pe_ttm'] > 0 and row['dv_ttm'] > 0:
            payout_ratio = float(row['pe_ttm']) * (float(row['dv_ttm']) / 100)
            # Cap at 100% (values > 1.0 indicate unsustainable dividends)
            if payout_ratio > 1.0:
                payout_ratio = min(payout_ratio, 2.0)  # Allow up to 200% for display

        return {
            "trade_date": actual_trade_date,  # Return the actual trade date
            "close_price": float(row['close']) if pd.notna(row['close']) else None,
            "market_cap": float(row['total_mv']) / 10000 if pd.notna(row['total_mv']) else None,  # Convert to 亿
            "pe_ttm": float(row['pe_ttm']) if pd.notna(row['pe_ttm']) else None,
            "pb_ttm": float(row['pb']) if pd.notna(row['pb']) else None,
            "dividend_yield_ttm": float(row['dv_ttm']) if pd.notna(row['dv_ttm']) else None,
            "payout_ratio": payout_ratio,  # Calculated dividend payout ratio
        }

    except Exception as e:
        print(f"  [ERROR] Failed to fetch daily_basic for {ts_code}: {e}")
        return None


def fetch_historical_daily_basic(ts_code: str, years: int = 5) -> pd.DataFrame:
    """
    Fetch historical daily basic data for percentile calculation.
    Returns DataFrame with trade_date and dv_ttm (dividend yield).
    """
    try:
        end_date = datetime.now().strftime("%Y%m%d")
        start_date = (datetime.now() - timedelta(days=years * 365)).strftime("%Y%m%d")

        df = fetch_with_retry(
            pro.daily_basic,
            ts_code=ts_code,
            start_date=start_date,
            end_date=end_date,
            fields='trade_date,close,dv_ttm,pe_ttm,pb'
        )

        if df.empty:
            print(f"  [WARN] No historical data for {ts_code}")
            return pd.DataFrame()

        # Convert trade_date to datetime
        df['trade_date'] = pd.to_datetime(df['trade_date'])

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


def calculate_yield_percentile(current_yield: float, historical_df: pd.DataFrame) -> float:
    """
    Calculate the percentile of current dividend yield vs historical yields.
    Higher percentile = higher yield = more attractive for dividend investors.
    """
    if historical_df.empty or current_yield is None or current_yield <= 0:
        return None

    try:
        # Get historical yields
        historical_yields = historical_df['dv_ttm'].dropna()

        if len(historical_yields) == 0:
            return None

        # Remove outliers (yields > 100% are likely errors)
        historical_yields = historical_yields[historical_yields < 100]
        historical_yields = historical_yields[historical_yields > 0]

        if len(historical_yields) == 0:
            return None

        # Calculate percentile
        percentile = (np.sum(historical_yields <= current_yield) / len(historical_yields)) * 100

        return round(percentile, 2)

    except Exception as e:
        print(f"  [WARN] Failed to calculate yield percentile: {e}")
        return None


def calculate_pe_percentile(current_pe: float, historical_df: pd.DataFrame) -> float:
    """
    Calculate PE percentile based on historical data.
    Lower percentile = lower PE = more attractive (cheaper).
    """
    if historical_df.empty or current_pe is None or current_pe <= 0:
        return None

    try:
        historical_pe = historical_df['pe_ttm'].dropna()

        if len(historical_pe) == 0:
            return None

        # Remove outliers
        historical_pe = historical_pe[historical_pe > 0]
        historical_pe = historical_pe[historical_pe < 1000]

        if len(historical_pe) == 0:
            return None

        percentile = (np.sum(historical_pe <= current_pe) / len(historical_pe)) * 100
        return round(percentile, 2)

    except Exception as e:
        print(f"  [WARN] Failed to calculate PE percentile: {e}")
        return None


def save_daily_metrics(conn, symbol: str, trade_date: str, metrics: dict):
    """
    Save calculated metrics to daily_metrics table.
    Uses upsert for idempotency.
    """
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

    def to_python_type(val):
        if val is None:
            return None
        if isinstance(val, (np.integer, np.floating)):
            return float(val)
        return val

    with conn.cursor() as cur:
        cur.execute(upsert_sql, (
            symbol,
            trade_date,
            to_python_type(metrics.get("close_price")),
            to_python_type(metrics.get("market_cap")),
            to_python_type(metrics.get("pe_ttm")),
            to_python_type(metrics.get("pb_ttm")),
            to_python_type(metrics.get("dividend_yield_ttm")),
            to_python_type(metrics.get("pe_percentile")),
            to_python_type(metrics.get("pb_percentile")),
            to_python_type(metrics.get("yield_percentile")),
        ))
    conn.commit()


def fetch_financial_indicators(ts_code: str) -> dict:
    """
    Fetch quarterly financial indicators from Tushare.
    Returns dict with ROE, debt ratio, gross margin, etc.

    NOTE: Tushare returns percentage fields as raw numbers (e.g., 5.0 = 5%).
    We convert them to decimals (e.g., 0.05) for consistent storage.

    OPERATING CASH FLOW FOCUS:
    We use Operating Cash Flow (经营活动现金流) instead of Free Cash Flow (FCFF)
    because it better reflects the company's "cash generation ability" for dividend investors.
    This avoids penalizing capital-intensive businesses (utilities, infrastructure) that have
    large capex but strong operating cash flows.
    """
    try:
        # Get latest financial indicator - now including growth metrics
        df = fetch_with_retry(
            pro.fina_indicator,
            ts_code=ts_code,
            fields='ts_code,end_date,roe,grossprofit_margin,debt_to_assets,or_yoy,netprofit_yoy'
        )

        if df is None or df.empty:
            print(f"  [INFO] No financial indicator data for {ts_code}")
            return None

        # Get the latest record
        latest = df.iloc[0]

        # Parse report period (end_date format: 20240930 -> 2024Q3)
        try:
            end_date = str(latest['end_date'])
            year = int(end_date[:4])
            month = int(end_date[4:6])
            quarter = (month - 1) // 3 + 1
            report_period = f"{year}Q{quarter}"
        except:
            report_period = None

        # ALWAYS USE OPERATING CASH FLOW (not Free Cash Flow)
        # This better represents dividend sustainability for all types of businesses
        operating_cash_flow = None
        try:
            # Fetch cash flow statement for operating cash flow
            cf_df = fetch_with_retry(
                pro.cashflow,
                ts_code=ts_code,
                fields='ts_code,end_date,n_cashflow_act'
            )

            if cf_df is not None and not cf_df.empty:
                # Match the same end_date as the financial indicator
                cf_latest = cf_df[cf_df['end_date'] == latest['end_date']]
                if not cf_latest.empty:
                    ocf = cf_latest.iloc[0]['n_cashflow_act']
                    if pd.notna(ocf):
                        operating_cash_flow = float(ocf)
                        print(f"  Operating Cash Flow (经营现金流): {operating_cash_flow:.2f} 万元")
                else:
                    # If exact date not found, use the latest available
                    ocf = cf_df.iloc[0]['n_cashflow_act']
                    if pd.notna(ocf):
                        operating_cash_flow = float(ocf)
                        print(f"  Operating Cash Flow (latest, 经营现金流): {operating_cash_flow:.2f} 万元")
        except Exception as ocf_error:
            print(f"  [WARN] Failed to fetch operating cash flow: {ocf_error}")

        return {
            "report_period": report_period,
            "roe_ttm": float(latest['roe']) / 100 if pd.notna(latest['roe']) else None,  # Convert % to decimal
            "gross_margin": float(latest['grossprofit_margin']) / 100 if pd.notna(latest['grossprofit_margin']) else None,  # Convert % to decimal
            "debt_to_asset_ratio": float(latest['debt_to_assets']) / 100 if pd.notna(latest['debt_to_assets']) else None,  # Convert % to decimal
            "free_cash_flow": operating_cash_flow,  # Store operating cash flow in this field
            "dividend_payout_ratio": None,  # Will be calculated separately if needed
            "revenue_growth_yoy": float(latest['or_yoy']) / 100 if pd.notna(latest['or_yoy']) else None,  # Convert % to decimal (Tushare: or_yoy = operating revenue YoY)
            "net_profit_growth_yoy": float(latest['netprofit_yoy']) / 100 if pd.notna(latest['netprofit_yoy']) else None,  # Convert % to decimal
        }

    except Exception as e:
        print(f"  [WARN] Failed to fetch financial indicators for {ts_code}: {e}")
        return None


def fetch_growth_metrics(ts_code: str) -> dict:
    """
    Fetch growth metrics from Tushare income statement.
    """
    try:
        # Get income data for YoY comparison
        df = fetch_with_retry(
            pro.income,
            ts_code=ts_code,
            fields='ts_code,end_date,total_revenue,n_income'
        )

        if df is None or len(df) < 5:
            return None

        # Current quarter and same quarter last year (4 quarters ago)
        current = df.iloc[0]
        last_year = df.iloc[4] if len(df) > 4 else df.iloc[-1]

        revenue_growth = None
        profit_growth = None

        # Calculate revenue growth YoY
        if pd.notna(current['total_revenue']) and pd.notna(last_year['total_revenue']) and last_year['total_revenue'] != 0:
            revenue_growth = (current['total_revenue'] - last_year['total_revenue']) / abs(last_year['total_revenue'])

        # Calculate profit growth YoY
        if pd.notna(current['n_income']) and pd.notna(last_year['n_income']) and last_year['n_income'] != 0:
            profit_growth = (current['n_income'] - last_year['n_income']) / abs(last_year['n_income'])

        return {
            "revenue_growth_yoy": revenue_growth,
            "net_profit_growth_yoy": profit_growth,
        }

    except Exception as e:
        print(f"  [WARN] Failed to fetch growth metrics for {ts_code}: {e}")
        return None


def save_quarterly_financials(conn, symbol: str, financials: dict):
    """
    Save quarterly financial data to database with data validation.
    Filters out invalid or dirty data before inserting.
    """
    if not financials or not financials.get("report_period"):
        print(f"  [SKIP] Missing financials or report_period for {symbol}")
        return

    report_period = financials.get("report_period")

    # Data cleaning: Check year validity (filter out data before 2020)
    try:
        year = int(report_period.split('Q')[0])
        if year < 2020:
            print(f"  [SKIP] Report period {report_period} is before 2020 for {symbol}")
            return
    except (ValueError, IndexError, AttributeError):
        print(f"  [SKIP] Invalid report_period format: {report_period} for {symbol}")
        return

    # Data cleaning: Check if at least one key metric is valid
    roe_ttm = financials.get("roe_ttm")
    free_cash_flow = financials.get("free_cash_flow")

    has_valid_data = False

    if roe_ttm is not None and roe_ttm != '' and not (isinstance(roe_ttm, float) and np.isnan(roe_ttm)):
        has_valid_data = True

    if free_cash_flow is not None and free_cash_flow != '' and not (isinstance(free_cash_flow, float) and np.isnan(free_cash_flow)):
        has_valid_data = True

    if not has_valid_data:
        print(f"  [SKIP] No valid key metrics (roe_ttm or free_cash_flow) for {symbol} {report_period}")
        return

    upsert_sql = """
        INSERT INTO quarterly_financials (
            symbol, report_period, publish_date,
            free_cash_flow, debt_to_asset_ratio, dividend_payout_ratio,
            roe_ttm, gross_margin, revenue_growth_yoy, net_profit_growth_yoy
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
        ON CONFLICT (symbol, report_period) DO UPDATE SET
            publish_date = EXCLUDED.publish_date,
            free_cash_flow = EXCLUDED.free_cash_flow,
            debt_to_asset_ratio = EXCLUDED.debt_to_asset_ratio,
            dividend_payout_ratio = EXCLUDED.dividend_payout_ratio,
            roe_ttm = EXCLUDED.roe_ttm,
            gross_margin = EXCLUDED.gross_margin,
            revenue_growth_yoy = EXCLUDED.revenue_growth_yoy,
            net_profit_growth_yoy = EXCLUDED.net_profit_growth_yoy
    """

    def to_python_type(val):
        if val is None:
            return None
        if isinstance(val, (np.integer, np.floating)):
            return float(val)
        return val

    with conn.cursor() as cur:
        cur.execute(upsert_sql, (
            symbol,
            financials.get("report_period"),
            datetime.now().strftime("%Y-%m-%d"),
            to_python_type(financials.get("free_cash_flow")),
            to_python_type(financials.get("debt_to_asset_ratio")),
            to_python_type(financials.get("dividend_payout_ratio")),
            to_python_type(financials.get("roe_ttm")),
            to_python_type(financials.get("gross_margin")),
            to_python_type(financials.get("revenue_growth_yoy")),
            to_python_type(financials.get("net_profit_growth_yoy")),
        ))
    conn.commit()
    print(f"  [OK] Saved quarterly financials for {symbol} ({financials.get('report_period')})")


def process_single_stock(conn, symbol: str, name: str):
    """
    Process a single stock: fetch data from Tushare, calculate metrics, save to DB.
    """
    print(f"\nProcessing {symbol} ({name})...")

    # Convert symbol to Tushare ts_code
    ts_code = convert_symbol_to_ts_code(symbol)
    print(f"  Tushare code: {ts_code}")

    # 1. Get latest daily basic data
    daily_data = fetch_daily_basic(ts_code)

    if daily_data is None:
        print(f"  [SKIP] Could not fetch daily data for {symbol}")
        return False

    # IMPORTANT: Skip update if dividend yield is missing
    # This prevents overwriting good data with incomplete data
    # (Tushare sometimes returns price but not dividend data in early trading hours)
    if daily_data["dividend_yield_ttm"] is None or daily_data["dividend_yield_ttm"] <= 0:
        print(f"  [SKIP] Dividend yield is missing or zero for {symbol} - data may be incomplete")
        print(f"  [INFO] This is common in early trading hours. Try again later today.")
        return False

    # Use the actual trade date from the API response
    trade_date_raw = daily_data.get('trade_date')
    if trade_date_raw:
        # Convert from YYYYMMDD to YYYY-MM-DD
        trade_date = f"{trade_date_raw[:4]}-{trade_date_raw[4:6]}-{trade_date_raw[6:8]}"
    else:
        # Fallback to current date if not available
        trade_date = datetime.now().strftime("%Y-%m-%d")

    print(f"  Price: {daily_data['close_price']}, PE: {daily_data['pe_ttm']}, PB: {daily_data['pb_ttm']}")
    print(f"  Dividend Yield TTM: {daily_data['dividend_yield_ttm']}%")
    if daily_data.get('payout_ratio'):
        print(f"  Payout Ratio (calculated): {daily_data['payout_ratio'] * 100:.1f}%")

    # 2. Get historical data for percentile calculation
    time.sleep(REQUEST_DELAY)
    historical = fetch_historical_daily_basic(ts_code, HISTORY_YEARS)
    print(f"  Historical data points: {len(historical)}")

    # 3. Calculate percentiles
    yield_percentile = None
    pe_percentile = None

    if not historical.empty:
        if daily_data["dividend_yield_ttm"] and daily_data["dividend_yield_ttm"] > 0:
            yield_percentile = calculate_yield_percentile(
                daily_data["dividend_yield_ttm"], historical
            )
            print(f"  Yield Percentile: {yield_percentile}")

        if daily_data["pe_ttm"]:
            pe_percentile = calculate_pe_percentile(
                daily_data["pe_ttm"], historical
            )
            print(f"  PE Percentile: {pe_percentile}")

    # 4. Save daily metrics to database
    metrics = {
        "close_price": daily_data["close_price"],
        "market_cap": daily_data["market_cap"],
        "pe_ttm": daily_data["pe_ttm"],
        "pb_ttm": daily_data["pb_ttm"],
        "dividend_yield_ttm": daily_data["dividend_yield_ttm"],
        "pe_percentile": pe_percentile,
        "pb_percentile": None,  # Can be calculated if needed
        "yield_percentile": yield_percentile,
    }

    save_daily_metrics(conn, symbol, trade_date, metrics)
    print(f"  [OK] Saved daily metrics for {symbol} (trade date: {trade_date})")

    # 5. Fetch and save quarterly financials
    print(f"  Fetching quarterly financials...")
    time.sleep(REQUEST_DELAY)

    financials = fetch_financial_indicators(ts_code)
    if financials:
        # Try to get growth metrics as fallback (only if not already provided by fina_indicator)
        if financials.get('revenue_growth_yoy') is None or financials.get('net_profit_growth_yoy') is None:
            time.sleep(REQUEST_DELAY)
            growth = fetch_growth_metrics(ts_code)
            if growth:
                # Only update fields that are None
                if financials.get('revenue_growth_yoy') is None and growth.get('revenue_growth_yoy') is not None:
                    financials['revenue_growth_yoy'] = growth['revenue_growth_yoy']
                if financials.get('net_profit_growth_yoy') is None and growth.get('net_profit_growth_yoy') is not None:
                    financials['net_profit_growth_yoy'] = growth['net_profit_growth_yoy']

        # Use calculated payout ratio from daily_data (PE * dividend_yield)
        # This is more reliable than fetching dividend announcements
        if daily_data.get('payout_ratio') is not None:
            financials["dividend_payout_ratio"] = daily_data['payout_ratio']

        save_quarterly_financials(conn, symbol, financials)
    else:
        print(f"  [INFO] No quarterly financials available for {symbol}")

    return True


def get_stock_info(conn, symbol: str):
    """
    Get stock info from database for a specific symbol.
    Returns (symbol, name) tuple or None if not found.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT symbol, name FROM stock_meta WHERE symbol = %s AND is_active = true",
            (symbol,)
        )
        result = cur.fetchone()
        return result if result else None


def main():
    """Main ETL pipeline."""
    # Parse command line arguments
    parser = argparse.ArgumentParser(
        description="Update stock data from Tushare Pro API"
    )
    parser.add_argument(
        '--symbol',
        type=str,
        help='Update only the specified stock symbol (e.g., 600519)'
    )
    args = parser.parse_args()

    print("=" * 60)
    print("Dividend Dashboard - Data Update Script (Tushare)")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if args.symbol:
        print(f"Mode: Single stock update ({args.symbol})")
    else:
        print("Mode: Update all active stocks")
    print("=" * 60)

    try:
        # Connect to database
        conn = get_connection()
        print("Connected to database.")

        # Step 1: Determine which stocks to process
        if args.symbol:
            # Single stock mode
            stock_info = get_stock_info(conn, args.symbol)
            if not stock_info:
                print(f"\n[ERROR] Stock {args.symbol} not found in database or not active.")
                print("Please add the stock first using the 'Add Stock' feature.")
                sys.exit(1)

            stocks = [stock_info]
            print(f"\nFound stock: {stock_info[0]} ({stock_info[1]})")
        else:
            # All stocks mode
            # Seed stock pool if empty
            seed_stock_pool(conn)

            # Get all active stocks
            stocks = get_active_stocks(conn)
            if not stocks:
                print("No active stocks to process. Add stocks to stock_meta table.")
                return

            print(f"\nFound {len(stocks)} active stocks to process.")

        # Step 2: Process stocks
        success_count = 0
        fail_count = 0

        for symbol, name in stocks:
            try:
                if process_single_stock(conn, symbol, name):
                    success_count += 1
                else:
                    fail_count += 1
            except Exception as e:
                print(f"  [ERROR] Unexpected error for {symbol}: {e}")
                import traceback
                traceback.print_exc()
                fail_count += 1

            # Rate limiting between stocks (only if processing multiple stocks)
            if len(stocks) > 1:
                time.sleep(REQUEST_DELAY)

        # Summary
        print("\n" + "=" * 60)
        print("Update Complete!")
        print(f"  Success: {success_count}")
        print(f"  Failed:  {fail_count}")
        print(f"Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 60)

        conn.close()

    except psycopg2.OperationalError as e:
        print(f"[FATAL] Database connection error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"[FATAL] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
