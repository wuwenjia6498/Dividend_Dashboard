"""
Test script to verify data format conversion for growth metrics
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import tushare as ts
import pandas as pd

# Load environment variables
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# Initialize Tushare Pro API
TUSHARE_TOKEN = os.getenv("TUSHARE_TOKEN")
if not TUSHARE_TOKEN:
    print("ERROR: TUSHARE_TOKEN not found")
    sys.exit(1)

pro = ts.pro_api(TUSHARE_TOKEN)

# Test with 招商银行
ts_code = "600036.SH"
print(f"Testing data format for {ts_code}")
print("=" * 60)

# Fetch financial indicators
df = pro.fina_indicator(
    ts_code=ts_code,
    fields='ts_code,end_date,roe,grossprofit_margin,or_yoy,netprofit_yoy'
)

if df is not None and not df.empty:
    latest = df.iloc[0]

    print("\n[RAW DATA FROM TUSHARE]")
    print(f"  ROE: {latest['roe']}")
    print(f"  Gross Margin: {latest['grossprofit_margin']}")
    print(f"  Revenue Growth YoY (or_yoy): {latest['or_yoy']}")
    print(f"  Net Profit Growth YoY (netprofit_yoy): {latest['netprofit_yoy']}")

    print("\n[CONVERTED DATA (divided by 100)]")
    roe = float(latest['roe']) / 100 if pd.notna(latest['roe']) else None
    gross_margin = float(latest['grossprofit_margin']) / 100 if pd.notna(latest['grossprofit_margin']) else None
    rev_growth = float(latest['or_yoy']) / 100 if pd.notna(latest['or_yoy']) else None
    profit_growth = float(latest['netprofit_yoy']) / 100 if pd.notna(latest['netprofit_yoy']) else None

    print(f"  ROE: {roe} (display as {roe*100:.2f}%)" if roe else "  ROE: None")
    print(f"  Gross Margin: {gross_margin} (display as {gross_margin*100:.2f}%)" if gross_margin else "  Gross Margin: None")
    print(f"  Revenue Growth YoY: {rev_growth} (display as {rev_growth*100:.2f}%)" if rev_growth else "  Revenue Growth: None")
    print(f"  Net Profit Growth YoY: {profit_growth} (display as {profit_growth*100:.2f}%)" if profit_growth else "  Net Profit Growth: None")

    print("\n[VERIFICATION]")
    if rev_growth and abs(rev_growth) < 10:  # Should be < 10 (i.e., < 1000%)
        print("  ✅ Revenue growth data looks correct (in decimal format)")
    else:
        print("  ❌ Revenue growth data might be incorrect")

    if profit_growth and abs(profit_growth) < 10:
        print("  ✅ Profit growth data looks correct (in decimal format)")
    else:
        print("  ❌ Profit growth data might be incorrect")
else:
    print("No data returned from Tushare")

print("=" * 60)
