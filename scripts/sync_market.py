"""
Market Data Sync Script
Fetches all A-share stock list from Tushare and syncs to market_master table
Used for autocomplete and search functionality
"""
import os
import time
from pathlib import Path
from datetime import datetime
import tushare as ts
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# Initialize Tushare Pro API
TUSHARE_TOKEN = os.getenv("TUSHARE_TOKEN")
if not TUSHARE_TOKEN:
    raise ValueError("TUSHARE_TOKEN not found in environment variables")

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


def extract_symbol(ts_code: str) -> str:
    """
    Convert Tushare ts_code to symbol.
    Example: '600036.SH' -> '600036'
    """
    if '.' in ts_code:
        return ts_code.split('.')[0]
    return ts_code


def fetch_all_stocks():
    """
    Fetch all listed A-share stocks from Tushare.
    Returns DataFrame with columns: ts_code, symbol, name, industry
    """
    print("Fetching all A-share stocks from Tushare...")

    try:
        # Get all listed stocks (list_status='L')
        df = pro.stock_basic(
            exchange='',
            list_status='L',
            fields='ts_code,symbol,name,industry'
        )

        if df.empty:
            print("  [WARN] No stocks returned from Tushare")
            return None

        print(f"  [OK] Fetched {len(df)} stocks")
        return df

    except Exception as e:
        print(f"  [ERROR] Failed to fetch stocks from Tushare: {e}")
        return None


def sync_to_database(conn, df):
    """
    Sync stock data to market_master table.
    Uses UPSERT to handle existing records.
    """
    print("\nSyncing data to database...")

    # Prepare data for insertion
    records = []
    for _, row in df.iterrows():
        symbol = row['symbol']  # Tushare already provides symbol without exchange suffix
        name = row['name']
        sector = row['industry'] if row['industry'] else None

        records.append((symbol, name, sector, 'L'))

    print(f"  Preparing to insert/update {len(records)} records...")

    # Use UPSERT for idempotency
    upsert_sql = """
        INSERT INTO market_master (symbol, name, sector, list_status)
        VALUES %s
        ON CONFLICT (symbol) DO UPDATE SET
            name = EXCLUDED.name,
            sector = EXCLUDED.sector,
            list_status = EXCLUDED.list_status,
            updated_at = NOW()
    """

    try:
        with conn.cursor() as cur:
            execute_values(cur, upsert_sql, records)
        conn.commit()
        print(f"  [OK] Successfully synced {len(records)} stocks to database")
        return len(records)

    except Exception as e:
        conn.rollback()
        print(f"  [ERROR] Failed to sync to database: {e}")
        raise


def show_sample_data(conn):
    """Show sample data for verification"""
    print("\n" + "=" * 60)
    print("Sample Data (First 10 records):")
    print("=" * 60)

    with conn.cursor() as cur:
        cur.execute("""
            SELECT symbol, name, sector
            FROM market_master
            ORDER BY symbol
            LIMIT 10
        """)
        rows = cur.fetchall()

        for symbol, name, sector in rows:
            print(f"  {symbol:<10} {name:<20} {sector or '未分类'}")


def main():
    """Main execution function"""
    print("=" * 60)
    print("Market Data Sync Script")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    try:
        # Step 1: Connect to database
        conn = get_connection()
        print("Connected to database.\n")

        # Step 2: Fetch all stocks from Tushare
        df = fetch_all_stocks()

        if df is None or df.empty:
            print("No data to sync. Exiting.")
            return

        # Step 3: Sync to database
        synced_count = sync_to_database(conn, df)

        # Step 4: Show sample data
        show_sample_data(conn)

        # Summary
        print("\n" + "=" * 60)
        print("Sync Complete!")
        print(f"  Total synced: {synced_count} stocks")
        print(f"Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 60)

        conn.close()

    except Exception as e:
        print(f"\n[FATAL] Error: {e}")
        import traceback
        traceback.print_exc()
        raise


if __name__ == "__main__":
    main()
