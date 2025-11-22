"""
Database Initialization Script
Creates all tables for the Dividend Dashboard project.
"""

import os
import sys
from pathlib import Path

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


def create_tables(conn):
    """Create all required tables."""

    schema_sql = """
    -- 1. Stock Meta Information (Watchlist)
    CREATE TABLE IF NOT EXISTS stock_meta (
        symbol VARCHAR(20) PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        sector VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
    );

    -- 2. Daily Metrics (Valuations & Prices)
    CREATE TABLE IF NOT EXISTS daily_metrics (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) REFERENCES stock_meta(symbol),
        trade_date DATE NOT NULL,

        -- Price Data
        close_price DECIMAL(10, 2),
        market_cap DECIMAL(15, 2),

        -- Core Valuation Metrics
        pe_ttm DECIMAL(10, 2),
        pb_ttm DECIMAL(10, 2),
        dividend_yield_ttm DECIMAL(10, 4),

        -- Historical Percentiles (0-100)
        pe_percentile DECIMAL(5, 2),
        pb_percentile DECIMAL(5, 2),
        yield_percentile DECIMAL(5, 2),

        UNIQUE(symbol, trade_date)
    );

    -- 3. Quarterly Financials
    CREATE TABLE IF NOT EXISTS quarterly_financials (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) REFERENCES stock_meta(symbol),
        report_period VARCHAR(20) NOT NULL,
        publish_date DATE,

        -- Risk Indicators
        free_cash_flow DECIMAL(15, 2),
        debt_to_asset_ratio DECIMAL(10, 4),
        dividend_payout_ratio DECIMAL(10, 4),

        -- Quality Indicators
        roe_ttm DECIMAL(10, 4),
        gross_margin DECIMAL(10, 4),
        revenue_growth_yoy DECIMAL(10, 4),
        net_profit_growth_yoy DECIMAL(10, 4),

        UNIQUE(symbol, report_period)
    );

    -- Create indexes for better query performance
    CREATE INDEX IF NOT EXISTS idx_daily_metrics_symbol ON daily_metrics(symbol);
    CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_metrics(trade_date);
    CREATE INDEX IF NOT EXISTS idx_quarterly_symbol ON quarterly_financials(symbol);
    CREATE INDEX IF NOT EXISTS idx_quarterly_period ON quarterly_financials(report_period);
    """

    with conn.cursor() as cur:
        cur.execute(schema_sql)
    conn.commit()
    print("Tables created successfully!")


def drop_tables(conn):
    """Drop all tables (use with caution)."""
    drop_sql = """
    DROP TABLE IF EXISTS quarterly_financials CASCADE;
    DROP TABLE IF EXISTS daily_metrics CASCADE;
    DROP TABLE IF EXISTS stock_meta CASCADE;
    """
    with conn.cursor() as cur:
        cur.execute(drop_sql)
    conn.commit()
    print("Tables dropped successfully!")


def main():
    """Main entry point."""
    if len(sys.argv) > 1 and sys.argv[1] == "--reset":
        confirm = input("This will DELETE all data. Type 'yes' to confirm: ")
        if confirm.lower() != "yes":
            print("Aborted.")
            return

    try:
        conn = get_connection()
        print(f"Connected to database: {os.getenv('DATABASE_NAME')}")

        if len(sys.argv) > 1 and sys.argv[1] == "--reset":
            drop_tables(conn)

        create_tables(conn)
        conn.close()
        print("Database initialization complete!")

    except psycopg2.OperationalError as e:
        print(f"Error connecting to database: {e}")
        print("\nMake sure:")
        print("1. PostgreSQL is running")
        print("2. Database exists (create with: CREATE DATABASE dividend_dashboard;)")
        print("3. .env file has correct credentials")
        sys.exit(1)


if __name__ == "__main__":
    main()
