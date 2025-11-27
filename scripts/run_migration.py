"""
Database Migration Runner
Executes SQL migration files using psycopg2
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


def run_migration(conn, sql_file_path):
    """Execute SQL migration file."""
    print(f"Running migration: {sql_file_path}")

    with open(sql_file_path, 'r', encoding='utf-8') as f:
        sql = f.read()

    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
        print(f"[OK] Migration completed successfully")
        return True
    except Exception as e:
        conn.rollback()
        print(f"[ERROR] Migration failed: {e}")
        return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python run_migration.py <sql_file_path>")
        print("Example: python run_migration.py db/migrations/002_create_market_master.sql")
        sys.exit(1)

    sql_file = sys.argv[1]
    sql_path = Path(__file__).parent.parent / sql_file

    if not sql_path.exists():
        print(f"Error: SQL file not found: {sql_path}")
        sys.exit(1)

    print("=" * 60)
    print("Database Migration Runner")
    print("=" * 60)

    try:
        conn = get_connection()
        print("[OK] Connected to database\n")

        success = run_migration(conn, sql_path)

        conn.close()

        print("\n" + "=" * 60)
        if success:
            print("Migration completed successfully!")
        else:
            print("Migration failed!")
            sys.exit(1)
        print("=" * 60)

    except Exception as e:
        print(f"\n[FATAL] Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
