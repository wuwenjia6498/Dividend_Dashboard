"""
Data Update Script for Dividend Dashboard
ETL pipeline: Fetch stock data, calculate metrics, and store to database.
"""

import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from decimal import Decimal

# Disable proxy for akshare (accessing domestic Chinese APIs)
os.environ['NO_PROXY'] = '*'
os.environ['no_proxy'] = '*'
os.environ.pop('HTTP_PROXY', None)
os.environ.pop('HTTPS_PROXY', None)
os.environ.pop('http_proxy', None)
os.environ.pop('https_proxy', None)

import akshare as ak
import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

# Force disable proxy for all requests in this session
import requests
requests.Session.request = (lambda old_request: lambda self, *args, **kwargs: old_request(self, *args, proxies={'http': None, 'https': None}, **kwargs))(requests.Session.request)

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
REQUEST_DELAY = 1.0  # seconds between API requests
HISTORY_YEARS = 5    # years of historical data for percentile calculation


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


def fetch_realtime_quote(symbol: str) -> dict:
    """
    Fetch real-time stock quote using akshare.
    Returns dict with price, market_cap, pe_ttm, pb_ttm.
    """
    try:
        # Use individual stock info API (more reliable than full market API)
        df = ak.stock_individual_info_em(symbol=symbol)

        if df.empty:
            print(f"  [WARN] No data for symbol {symbol}")
            return None

        # Convert to dict for easier access
        info = dict(zip(df["item"], df["value"]))

        close_price = float(info.get("最新", 0)) or float(info.get("总市值", 0)) / float(info.get("总股本", 1))
        market_cap = float(info.get("总市值", 0)) / 1e8 if info.get("总市值") else None

        # PE/PB will be calculated from historical data or left as None for now
        # These can be added later with appropriate data sources

        return {
            "close_price": close_price,
            "market_cap": market_cap,
            "pe_ttm": None,  # TODO: Add reliable PE source
            "pb_ttm": None,  # TODO: Add reliable PB source
        }
    except Exception as e:
        print(f"  [ERROR] Failed to fetch realtime quote for {symbol}: {e}")
        return None


def fetch_dividend_data(symbol: str) -> float:
    """
    Fetch dividend data and calculate TTM dividend amount.
    Returns total dividend per share in the last 12 months.
    """
    try:
        # Get dividend history detail
        df = ak.stock_history_dividend_detail(symbol=symbol, indicator="分红")

        if df.empty:
            print(f"  [INFO] No dividend data for {symbol}")
            return 0.0

        # Filter dividends in the last 12 months
        cutoff_date = datetime.now() - timedelta(days=365)

        # Find date and dividend columns
        date_col = None
        dividend_col = None

        for col in df.columns:
            col_lower = str(col).lower()
            if '公告' in col or '日期' in col or 'date' in col_lower:
                date_col = col
            if '派息' in col or 'dividend' in col_lower or '分红' in col:
                dividend_col = col

        if date_col is None or dividend_col is None:
            print(f"  [WARN] Could not find date/dividend columns for {symbol}")
            return 0.0

        # Parse dates and filter
        df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
        recent = df[df[date_col] >= cutoff_date]

        if recent.empty:
            print(f"  [INFO] No recent dividends for {symbol} in past 12 months")
            return 0.0

        # Sum up dividends (already in per-share format from API: e.g., 22.6 means 2.26 yuan per share)
        ttm_dividend = 0.0
        for _, row in recent.iterrows():
            try:
                val = row[dividend_col]
                if pd.notna(val):
                    # The API returns "10派X元" format, so X/10 = per share
                    ttm_dividend += float(val) / 10
            except:
                continue

        return ttm_dividend

    except Exception as e:
        print(f"  [WARN] Failed to fetch dividend data for {symbol}: {e}")
        return 0.0


def fetch_historical_prices(symbol: str, years: int = 5) -> pd.DataFrame:
    """
    Fetch historical daily prices for percentile calculation.
    Returns DataFrame with date and close price.
    """
    try:
        end_date = datetime.now().strftime("%Y%m%d")
        start_date = (datetime.now() - timedelta(days=years * 365)).strftime("%Y%m%d")

        df = ak.stock_zh_a_hist(
            symbol=symbol,
            period="daily",
            start_date=start_date,
            end_date=end_date,
            adjust="qfq"  # 前复权
        )

        if df.empty:
            return pd.DataFrame()

        # Standardize column names
        df = df.rename(columns={
            "日期": "date",
            "收盘": "close",
            "开盘": "open",
            "最高": "high",
            "最低": "low",
            "成交量": "volume"
        })

        df["date"] = pd.to_datetime(df["date"])
        return df[["date", "close"]].copy()

    except Exception as e:
        print(f"  [ERROR] Failed to fetch historical data for {symbol}: {e}")
        return pd.DataFrame()


def calculate_yield_percentile(
    current_yield: float,
    historical_prices: pd.DataFrame,
    ttm_dividend: float
) -> float:
    """
    Calculate the percentile of current dividend yield vs historical yields.

    Uses simplified approach: (current - min) / (max - min) * 100
    based on historical price range to estimate yield range.
    """
    if historical_prices.empty or ttm_dividend <= 0 or current_yield <= 0:
        return None

    try:
        # Calculate historical yields based on price range
        # Higher price = lower yield, lower price = higher yield
        prices = historical_prices["close"].values

        # Calculate yield at each historical price point
        # yield = dividend / price (simplified, assumes constant dividend)
        historical_yields = ttm_dividend / prices * 100  # as percentage

        # Remove invalid values
        historical_yields = historical_yields[~np.isnan(historical_yields)]
        historical_yields = historical_yields[historical_yields > 0]
        historical_yields = historical_yields[historical_yields < 100]  # sanity check

        if len(historical_yields) == 0:
            return None

        # Calculate percentile
        # Higher percentile = higher yield = more attractive
        percentile = (np.sum(historical_yields <= current_yield) / len(historical_yields)) * 100

        return round(percentile, 2)

    except Exception as e:
        print(f"  [WARN] Failed to calculate yield percentile: {e}")
        return None


def calculate_pe_percentile(current_pe: float, historical_prices: pd.DataFrame, current_price: float, eps_ttm: float) -> float:
    """
    Calculate PE percentile based on historical price range.
    Lower percentile = lower PE = more attractive.
    """
    if historical_prices.empty or current_pe is None or eps_ttm is None or eps_ttm <= 0:
        return None

    try:
        prices = historical_prices["close"].values
        historical_pe = prices / eps_ttm

        historical_pe = historical_pe[~np.isnan(historical_pe)]
        historical_pe = historical_pe[historical_pe > 0]
        historical_pe = historical_pe[historical_pe < 1000]  # sanity check

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

    # Convert numpy types to Python native types
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


def fetch_financial_indicators(symbol: str) -> dict:
    """
    Fetch quarterly financial indicators using akshare.
    Returns dict with ROE, FCF, payout ratio, etc.
    """
    try:
        # Try different API methods for financial data
        df = None

        # Method 1: Try stock_financial_abstract_ths (同花顺)
        try:
            df = ak.stock_financial_abstract_ths(symbol=symbol, indicator="按报告期")
            if df is not None and not df.empty:
                print(f"  [INFO] Using THS financial data for {symbol}")
        except Exception as e:
            print(f"  [DEBUG] THS API failed: {e}")

        # Method 2: Try stock_financial_analysis_indicator
        if df is None or df.empty:
            try:
                df = ak.stock_financial_analysis_indicator(symbol=symbol)
                if df is not None and not df.empty:
                    print(f"  [INFO] Using EM financial indicator for {symbol}")
            except Exception as e:
                print(f"  [DEBUG] EM indicator API failed: {e}")

        if df is None or df.empty:
            print(f"  [INFO] No financial data available for {symbol}")
            return None

        # Get the latest row
        latest = df.iloc[0] if len(df) > 0 else None
        if latest is None:
            return None

        # Determine report period
        report_period = None
        for col in df.columns:
            col_str = str(col).lower()
            if '报告期' in col_str or '日期' in col_str or 'date' in col_str:
                try:
                    date_val = str(latest[col])
                    if date_val and date_val != 'nan':
                        dt = pd.to_datetime(date_val)
                        quarter = (dt.month - 1) // 3 + 1
                        report_period = f"{dt.year}Q{quarter}"
                        break
                except:
                    continue

        if not report_period:
            # Default to current quarter
            now = datetime.now()
            quarter = (now.month - 1) // 3 + 1
            report_period = f"{now.year}Q{quarter}"

        def safe_float(val):
            if val is None or pd.isna(val) or str(val) in ['--', '', 'nan', 'None']:
                return None
            try:
                return float(val)
            except:
                return None

        # Extract metrics from various column name formats
        roe = None
        gross_margin = None
        debt_ratio = None

        for col in df.columns:
            col_str = str(col)
            val = latest[col] if col in latest.index else None

            # ROE
            if roe is None and ('净资产收益率' in col_str or 'ROE' in col_str.upper()):
                roe = safe_float(val)
                if roe is not None and abs(roe) > 1:  # If percentage format
                    roe = roe / 100

            # Gross margin
            if gross_margin is None and ('毛利率' in col_str or '销售毛利率' in col_str):
                gross_margin = safe_float(val)
                if gross_margin is not None and abs(gross_margin) > 1:
                    gross_margin = gross_margin / 100

            # Debt ratio
            if debt_ratio is None and ('资产负债率' in col_str or '负债率' in col_str):
                debt_ratio = safe_float(val)
                if debt_ratio is not None and abs(debt_ratio) > 1:
                    debt_ratio = debt_ratio / 100

        return {
            "report_period": report_period,
            "roe_ttm": roe,
            "gross_margin": gross_margin,
            "debt_to_asset_ratio": debt_ratio,
            "free_cash_flow": None,
            "dividend_payout_ratio": None,
            "revenue_growth_yoy": None,
            "net_profit_growth_yoy": None,
        }

    except Exception as e:
        print(f"  [WARN] Failed to fetch financial indicators for {symbol}: {e}")
        return None


def fetch_cash_flow_data(symbol: str) -> dict:
    """
    Fetch cash flow data to get free cash flow.
    """
    try:
        # Get cash flow statement
        df = ak.stock_cash_flow_sheet_by_report_em(symbol=symbol)

        if df is None or df.empty:
            return None

        # Get latest report
        latest = df.iloc[0] if len(df) > 0 else None
        if latest is None:
            return None

        def safe_float(val):
            if pd.isna(val) or val == '--' or val == '':
                return None
            try:
                return float(val)
            except:
                return None

        # Free cash flow = Operating cash flow - CapEx
        operating_cf = None
        capex = None

        for col in df.columns:
            col_str = str(col)
            if '经营活动' in col_str and '现金流' in col_str and '净' in col_str:
                operating_cf = safe_float(latest[col])
            if '购建' in col_str or '固定资产' in col_str:
                capex = safe_float(latest[col])

        free_cash_flow = None
        if operating_cf is not None:
            if capex is not None:
                free_cash_flow = operating_cf - abs(capex)
            else:
                free_cash_flow = operating_cf

        return {
            "free_cash_flow": free_cash_flow,
        }

    except Exception as e:
        print(f"  [WARN] Failed to fetch cash flow for {symbol}: {e}")
        return None


def fetch_growth_data(symbol: str) -> dict:
    """
    Fetch growth metrics (revenue and profit growth YoY).
    """
    try:
        # Get profit statement for growth calculation
        df = ak.stock_profit_sheet_by_report_em(symbol=symbol)

        if df is None or len(df) < 2:
            return None

        def safe_float(val):
            if pd.isna(val) or val == '--' or val == '':
                return None
            try:
                return float(val)
            except:
                return None

        # Get current and previous year data
        current = df.iloc[0]
        previous = df.iloc[4] if len(df) > 4 else df.iloc[-1]  # Same quarter last year

        revenue_growth = None
        profit_growth = None

        # Find revenue column
        for col in df.columns:
            col_str = str(col)
            if '营业收入' in col_str or '营业总收入' in col_str:
                curr_rev = safe_float(current[col])
                prev_rev = safe_float(previous[col])
                if curr_rev and prev_rev and prev_rev != 0:
                    revenue_growth = (curr_rev - prev_rev) / abs(prev_rev)
                break

        # Find profit column
        for col in df.columns:
            col_str = str(col)
            if '净利润' in col_str and '归属' not in col_str:
                curr_profit = safe_float(current[col])
                prev_profit = safe_float(previous[col])
                if curr_profit and prev_profit and prev_profit != 0:
                    profit_growth = (curr_profit - prev_profit) / abs(prev_profit)
                break

        return {
            "revenue_growth_yoy": revenue_growth,
            "net_profit_growth_yoy": profit_growth,
        }

    except Exception as e:
        print(f"  [WARN] Failed to fetch growth data for {symbol}: {e}")
        return None


def save_quarterly_financials(conn, symbol: str, financials: dict):
    """
    Save quarterly financial data to database.
    """
    if not financials or not financials.get("report_period"):
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
    Process a single stock: fetch data, calculate metrics, save to DB.
    """
    print(f"\nProcessing {symbol} ({name})...")

    # 1. Get real-time quote
    quote = fetch_realtime_quote(symbol)

    if quote is None:
        print(f"  [SKIP] Could not fetch quote for {symbol}")
        return False

    print(f"  Price: {quote['close_price']}, PE: {quote['pe_ttm']}, PB: {quote['pb_ttm']}")

    # 2. Get dividend data
    time.sleep(REQUEST_DELAY)
    ttm_dividend = fetch_dividend_data(symbol)
    print(f"  TTM Dividend: {ttm_dividend}")

    # 3. Calculate dividend yield TTM
    dividend_yield_ttm = None
    if quote["close_price"] and quote["close_price"] > 0 and ttm_dividend > 0:
        dividend_yield_ttm = (ttm_dividend / quote["close_price"]) * 100
        print(f"  Dividend Yield TTM: {dividend_yield_ttm:.2f}%")

    # 4. Get historical data for percentile calculation
    time.sleep(REQUEST_DELAY)
    historical = fetch_historical_prices(symbol, HISTORY_YEARS)
    print(f"  Historical data points: {len(historical)}")

    # 5. Calculate percentiles
    yield_percentile = None
    pe_percentile = None

    if not historical.empty:
        if dividend_yield_ttm and dividend_yield_ttm > 0:
            yield_percentile = calculate_yield_percentile(
                dividend_yield_ttm, historical, ttm_dividend
            )
            print(f"  Yield Percentile: {yield_percentile}")

        if quote["pe_ttm"] and quote["close_price"]:
            eps_ttm = quote["close_price"] / quote["pe_ttm"] if quote["pe_ttm"] != 0 else None
            pe_percentile = calculate_pe_percentile(
                quote["pe_ttm"], historical, quote["close_price"], eps_ttm
            )
            print(f"  PE Percentile: {pe_percentile}")

    # 6. Save daily metrics to database
    trade_date = datetime.now().strftime("%Y-%m-%d")
    metrics = {
        "close_price": quote["close_price"],
        "market_cap": quote["market_cap"],
        "pe_ttm": quote["pe_ttm"],
        "pb_ttm": quote["pb_ttm"],
        "dividend_yield_ttm": dividend_yield_ttm,
        "pe_percentile": pe_percentile,
        "pb_percentile": None,  # Can be calculated similarly if needed
        "yield_percentile": yield_percentile,
    }

    save_daily_metrics(conn, symbol, trade_date, metrics)
    print(f"  [OK] Saved daily metrics for {symbol}")

    # 7. Fetch and save quarterly financials
    print(f"  Fetching quarterly financials...")
    time.sleep(REQUEST_DELAY)

    financials = fetch_financial_indicators(symbol)
    if financials:
        # Try to get additional data
        time.sleep(REQUEST_DELAY)
        cash_flow = fetch_cash_flow_data(symbol)
        if cash_flow:
            financials.update(cash_flow)

        time.sleep(REQUEST_DELAY)
        growth = fetch_growth_data(symbol)
        if growth:
            financials.update(growth)

        # Calculate payout ratio if we have dividend and profit data
        # payout_ratio = dividends / net_income (simplified)

        save_quarterly_financials(conn, symbol, financials)
    else:
        print(f"  [INFO] No quarterly financials available for {symbol}")

    return True


def main():
    """Main ETL pipeline."""
    print("=" * 60)
    print("Dividend Dashboard - Data Update Script")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    try:
        # Connect to database
        conn = get_connection()
        print("Connected to database.")

        # Step 1: Seed stock pool if empty
        seed_stock_pool(conn)

        # Step 2: Get active stocks
        stocks = get_active_stocks(conn)
        if not stocks:
            print("No active stocks to process. Add stocks to stock_meta table.")
            return

        print(f"\nFound {len(stocks)} active stocks to process.")

        # Step 3: Process each stock
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
                fail_count += 1

            # Rate limiting between stocks
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
        raise
    except Exception as e:
        print(f"[FATAL] Unexpected error: {e}")
        raise


if __name__ == "__main__":
    main()
