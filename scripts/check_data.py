"""Quick script to check database contents"""
import sys
sys.path.insert(0, r'H:\000-cursor学习\Dividend_Dashboard\scripts')
from update_data import get_connection

try:
    conn = get_connection()
    cur = conn.cursor()

    print("=== Stock Meta ===")
    cur.execute("SELECT * FROM stock_meta")
    for row in cur.fetchall():
        print(row)

    print("\n=== Daily Metrics (Last 10) ===")
    cur.execute("SELECT symbol, trade_date, close_price, dividend_yield_ttm, yield_percentile FROM daily_metrics ORDER BY trade_date DESC LIMIT 10")
    for row in cur.fetchall():
        print(row)

    conn.close()
    print("\nDatabase connection successful!")
except Exception as e:
    print(f"Error: {e}")
