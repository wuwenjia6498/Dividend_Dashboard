"""
Add database indexes to improve query performance
This script creates indexes for the daily_metrics and quarterly_financials tables
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


def add_indexes():
    """Add indexes to optimize database queries."""
    print("=== Adding Database Indexes ===\n")

    conn = get_connection()
    cursor = conn.cursor()

    try:
        # Read SQL file
        sql_file = Path(__file__).parent / "add_indexes.sql"
        with open(sql_file, 'r', encoding='utf-8') as f:
            sql = f.read()

        # Execute SQL commands
        print("Creating indexes...")
        cursor.execute(sql)
        conn.commit()

        print("[OK] Indexes created successfully!\n")

        # Show created indexes
        print("Verifying indexes on daily_metrics:")
        cursor.execute("""
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'daily_metrics'
        """)
        for row in cursor.fetchall():
            print(f"  - {row[0]}")

        print("\nVerifying indexes on quarterly_financials:")
        cursor.execute("""
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'quarterly_financials'
        """)
        for row in cursor.fetchall():
            print(f"  - {row[0]}")

        print("\n[OK] All done! Database queries should be much faster now.")

    except Exception as e:
        print(f"[ERROR] {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    add_indexes()
