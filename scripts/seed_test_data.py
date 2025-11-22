"""
Seed realistic test data for frontend development
Based on actual values from high-dividend Chinese stocks
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from update_data import get_connection
from datetime import datetime, timedelta
import random

def seed_test_data():
    """Insert realistic test data for 3 stocks"""
    conn = get_connection()
    cur = conn.cursor()

    # Test data based on realistic high-dividend A-share stocks
    test_data = [
        {
            'symbol': '601088',
            'name': '中国神华',
            'close_price': 42.07,
            'market_cap': 8358.69,
            'pe_ttm': 8.5,
            'pb_ttm': 1.2,
            'dividend_yield_ttm': 7.70,
            'pe_percentile': 15.5,
            'pb_percentile': 12.3,
            'yield_percentile': 98.92,  # Very high = very attractive (low price)
        },
        {
            'symbol': '600036',
            'name': '招商银行',
            'close_price': 43.0,
            'market_cap': 10820.5,
            'pe_ttm': 6.8,
            'pb_ttm': 0.92,
            'dividend_yield_ttm': 4.65,
            'pe_percentile': 35.2,
            'pb_percentile': 28.6,
            'yield_percentile': 78.4,  # High = attractive
        },
        {
            'symbol': '600900',
            'name': '长江电力',
            'close_price': 28.16,
            'market_cap': 6324.8,
            'pe_ttm': 18.2,
            'pb_ttm': 2.1,
            'dividend_yield_ttm': 4.09,
            'pe_percentile': 42.8,
            'pb_percentile': 45.2,
            'yield_percentile': 85.94,  # High = attractive
        },
    ]

    print("=" * 60)
    print("Seeding test data for frontend development")
    print("=" * 60)

    # Insert today's data
    trade_date = datetime.now().date()
    print(f"\nInserting data for {trade_date}...")

    for stock in test_data:
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

        cur.execute(upsert_sql, (
            stock['symbol'],
            trade_date,
            stock['close_price'],
            stock['market_cap'],
            stock['pe_ttm'],
            stock['pb_ttm'],
            stock['dividend_yield_ttm'],
            stock['pe_percentile'],
            stock['pb_percentile'],
            stock['yield_percentile'],
        ))
        print(f"  [OK] {stock['symbol']} ({stock['name']})")
        print(f"    Dividend Yield: {stock['dividend_yield_ttm']:.2f}% (Percentile: {stock['yield_percentile']:.1f}%)")

    # Add historical data for trend charts (past 60 days)
    print(f"\nGenerating historical data (60 days)...")

    for stock in test_data:
        base_price = stock['close_price']
        base_yield = stock['dividend_yield_ttm']

        for i in range(60, 0, -1):
            past_date = datetime.now().date() - timedelta(days=i)

            # Simulate realistic price movements (±5% range)
            price_factor = 1 + random.uniform(-0.05, 0.05)
            simulated_price = base_price * price_factor

            # Yield moves inversely with price
            simulated_yield = base_yield / price_factor

            # Percentile also varies
            percentile_variation = random.uniform(-5, 5)
            simulated_percentile = max(0, min(100, stock['yield_percentile'] + percentile_variation))

            cur.execute("""
                INSERT INTO daily_metrics (
                    symbol, trade_date, close_price, market_cap,
                    pe_ttm, pb_ttm, dividend_yield_ttm,
                    pe_percentile, pb_percentile, yield_percentile
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (symbol, trade_date) DO UPDATE SET
                    close_price = EXCLUDED.close_price,
                    dividend_yield_ttm = EXCLUDED.dividend_yield_ttm,
                    yield_percentile = EXCLUDED.yield_percentile
            """, (
                stock['symbol'],
                past_date,
                round(simulated_price, 2),
                round(stock['market_cap'] * price_factor, 2),
                stock['pe_ttm'],
                stock['pb_ttm'],
                round(simulated_yield, 4),
                stock['pe_percentile'],
                stock['pb_percentile'],
                round(simulated_percentile, 2),
            ))

    print(f"  [OK] Added 60 days x 3 stocks = 180 historical records")

    conn.commit()
    conn.close()

    print("\n" + "=" * 60)
    print("[SUCCESS] Test data seeded successfully!")
    print("=" * 60)
    print("\nYou can now:")
    print("1. Run check_data.py to verify the data")
    print("2. Start developing the Next.js frontend")
    print("\nNote: This is mock data for development only.")


if __name__ == "__main__":
    try:
        seed_test_data()
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
