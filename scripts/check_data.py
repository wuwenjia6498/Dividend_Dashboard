"""Quick script to check database contents"""
import sys
sys.path.insert(0, r'H:\000-cursor学习\Dividend_Dashboard\scripts')
from update_data import get_connection

try:
    conn = get_connection()
    cur = conn.cursor()

    print("=" * 60)
    print("Daily Metrics Record Count per Stock:")
    print("=" * 60)
    cur.execute("SELECT symbol, COUNT(*) as record_count FROM daily_metrics GROUP BY symbol ORDER BY symbol;")
    rows = cur.fetchall()
    for symbol, count in rows:
        print(f"{symbol}: {count} records")

    print("\n" + "=" * 60)
    print("Quarterly Financials Check:")
    print("=" * 60)
    cur.execute("""
        SELECT symbol, report_period,
               dividend_payout_ratio, roe_ttm, free_cash_flow
        FROM quarterly_financials
        ORDER BY symbol, report_period DESC
    """)
    rows = cur.fetchall()
    for symbol, period, payout, roe, fcf in rows:
        print(f"{symbol} ({period}): Payout={payout}, ROE={roe}, FCF={fcf}")

    print("\n" + "=" * 60)
    print("Sample Daily Metrics (Latest for each stock):")
    print("=" * 60)
    cur.execute("""
        SELECT DISTINCT ON (symbol)
            symbol, trade_date, close_price, dividend_yield_ttm, yield_percentile
        FROM daily_metrics
        ORDER BY symbol, trade_date DESC
    """)
    rows = cur.fetchall()
    for row in rows:
        print(row)

    conn.close()
    print("\nDatabase connection successful!")
except Exception as e:
    print(f"Error: {e}")
