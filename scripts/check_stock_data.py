"""
Check data for a specific stock in the database
"""
import os
import sys
from pathlib import Path
from datetime import datetime, timedelta

import psycopg2
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)


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


def check_stock_data(symbol):
    """Check data for a specific stock."""
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # Calculate date ranges
        now = datetime.now()
        two_years_ago = now - timedelta(days=365*2)
        five_years_ago = now - timedelta(days=365*5)

        two_years_ago_str = two_years_ago.strftime('%Y-%m-%d')
        five_years_ago_str = five_years_ago.strftime('%Y-%m-%d')

        print(f"=== Checking data for stock: {symbol} ===\n")
        print(f"Date ranges:")
        print(f"  5 years ago: {five_years_ago_str}")
        print(f"  2 years ago: {two_years_ago_str}")
        print(f"  Today: {now.strftime('%Y-%m-%d')}\n")

        # Check stock meta
        cursor.execute("""
            SELECT symbol, name, sector, is_active
            FROM stock_meta
            WHERE symbol = %s
        """, (symbol,))

        stock = cursor.fetchone()
        if not stock:
            print(f"[ERROR] Stock {symbol} not found in stock_meta table")
            return

        print(f"Stock Info: {stock[1]} ({stock[0]}) - Sector: {stock[2]}")
        print(f"Active: {stock[3]}\n")

        # Check total daily metrics
        cursor.execute("""
            SELECT COUNT(*), MIN(trade_date), MAX(trade_date)
            FROM daily_metrics
            WHERE symbol = %s
        """, (symbol,))

        total_count, min_date, max_date = cursor.fetchone()
        print(f"Total daily metrics: {total_count}")
        print(f"  Date range: {min_date} to {max_date}\n")

        # Check 5-year data
        cursor.execute("""
            SELECT COUNT(*)
            FROM daily_metrics
            WHERE symbol = %s AND trade_date >= %s
        """, (symbol, five_years_ago_str))

        five_year_count = cursor.fetchone()[0]
        print(f"Data in last 5 years (>= {five_years_ago_str}): {five_year_count}")

        # Check 2-year data
        cursor.execute("""
            SELECT COUNT(*)
            FROM daily_metrics
            WHERE symbol = %s AND trade_date >= %s
        """, (symbol, two_years_ago_str))

        two_year_count = cursor.fetchone()[0]
        print(f"Data in last 2 years (>= {two_years_ago_str}): {two_year_count}\n")

        # Show sample of recent data
        cursor.execute("""
            SELECT trade_date, close_price, dividend_yield_ttm, yield_percentile
            FROM daily_metrics
            WHERE symbol = %s
            ORDER BY trade_date DESC
            LIMIT 5
        """, (symbol,))

        print("Recent data (latest 5 records):")
        for row in cursor.fetchall():
            print(f"  {row[0]} | Price: {row[1]} | Yield: {row[2]}% | Percentile: {row[3]}")

        # Check quarterly financials
        cursor.execute("""
            SELECT report_period, roe_ttm, free_cash_flow, debt_to_asset_ratio
            FROM quarterly_financials
            WHERE symbol = %s
            ORDER BY report_period DESC
            LIMIT 1
        """, (symbol,))

        financial = cursor.fetchone()
        if financial:
            print(f"\nLatest financials ({financial[0]}):")
            print(f"  ROE: {financial[1]}")
            print(f"  Free Cash Flow: {financial[2]}")
            print(f"  Debt/Asset Ratio: {financial[3]}")
        else:
            print("\n[WARNING] No financial data found")

    except Exception as e:
        print(f"[ERROR] {e}")
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python check_data.py <symbol>")
        print("Example: python check_data.py 600938")
        sys.exit(1)

    symbol = sys.argv[1]
    check_stock_data(symbol)
