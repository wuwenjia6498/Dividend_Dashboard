"""
Fetch real financial data using Sina API and update database.
"""
import os
import time
from datetime import datetime
from pathlib import Path

os.environ['NO_PROXY'] = '*'
os.environ['no_proxy'] = '*'

import akshare as ak
import pandas as pd
import psycopg2
from dotenv import load_dotenv

# Load environment
load_dotenv(Path(__file__).parent.parent / ".env")

# Stocks to update
STOCKS = [
    {"symbol": "601088", "sina_code": "sh601088", "name": "中国神华"},
    {"symbol": "600036", "sina_code": "sh600036", "name": "招商银行"},
    {"symbol": "600900", "sina_code": "sh600900", "name": "长江电力"},
]


def get_connection():
    return psycopg2.connect(os.getenv("DATABASE_URL"))


def safe_float(val):
    """Convert value to float safely."""
    if val is None or pd.isna(val) or str(val) in ['--', '', 'nan', 'None', 'NaN']:
        return None
    try:
        return float(val)
    except:
        return None


def fetch_sina_financials(sina_code: str, symbol: str) -> dict:
    """
    Fetch financial data from Sina API.
    Returns dict with ROE, FCF, debt_ratio, etc.
    """
    print(f"  Fetching data for {sina_code}...")
    result = {}

    try:
        # 1. 利润表 - 获取净利润和同比增速
        profit_df = ak.stock_financial_report_sina(stock=sina_code, symbol='利润表')
        if profit_df is not None and not profit_df.empty:
            latest = profit_df.iloc[0]

            # 报告期
            report_date = str(latest.get('报告日', ''))
            current_year = None
            current_quarter = None
            if report_date:
                try:
                    dt = pd.to_datetime(report_date)
                    current_year = dt.year
                    current_quarter = (dt.month - 1) // 3 + 1
                    result['report_period'] = f"{current_year}Q{current_quarter}"
                except:
                    result['report_period'] = f"{datetime.now().year}Q{(datetime.now().month-1)//3+1}"

            # 净利润 (归属母公司) - 不同公司列名可能不同
            net_profit_col = None
            net_profit = None
            for col in ['归属于母公司所有者的净利润', '归属于母公司的净利润',
                        '归属母公司股东的净利润', '净利润']:
                if col in latest.index:
                    net_profit = safe_float(latest[col])
                    if net_profit:
                        net_profit_col = col
                        break
            result['net_profit'] = net_profit

            # 营业收入
            revenue_col = '营业总收入' if '营业总收入' in latest.index else '营业收入'
            revenue = safe_float(latest.get(revenue_col))
            result['revenue'] = revenue

            # 毛利率 = (营业收入 - 营业成本) / 营业收入
            cost = safe_float(latest.get('营业成本')) or safe_float(latest.get('营业总成本'))
            if revenue and cost:
                result['gross_margin'] = (revenue - cost) / revenue

            # 计算同比增速 - 查找去年同期数据
            if current_year and current_quarter and len(profit_df) > 4:
                last_year_date = f"{current_year - 1}{current_quarter * 3:02d}"  # e.g., 202409
                for idx, row in profit_df.iterrows():
                    row_date = str(row.get('报告日', ''))
                    if row_date.startswith(str(current_year - 1)) and row_date[4:6] == f"{current_quarter * 3:02d}":
                        # 找到去年同期
                        last_revenue = safe_float(row.get(revenue_col))
                        last_net_profit = safe_float(row.get(net_profit_col)) if net_profit_col else None

                        if revenue and last_revenue and last_revenue != 0:
                            result['revenue_growth_yoy'] = (revenue - last_revenue) / abs(last_revenue)
                        if net_profit and last_net_profit and last_net_profit != 0:
                            result['net_profit_growth_yoy'] = (net_profit - last_net_profit) / abs(last_net_profit)
                        break

        time.sleep(0.5)

        # 2. 资产负债表 - 获取总资产、总负债、净资产
        balance_df = ak.stock_financial_report_sina(stock=sina_code, symbol='资产负债表')
        if balance_df is not None and not balance_df.empty:
            latest = balance_df.iloc[0]

            # 总资产
            total_assets = safe_float(latest.get('资产总计'))
            # 总负债
            total_liabilities = safe_float(latest.get('负债合计'))
            # 净资产 (股东权益) - 不同公司列名可能不同
            equity = None
            for col in ['归属于母公司股东权益合计', '归属母公司股东权益合计',
                        '归属于母公司股东的权益', '所有者权益(或股东权益)合计',
                        '股东权益合计', '所有者权益合计']:
                if col in latest.index:
                    equity = safe_float(latest[col])
                    if equity:
                        break

            # 资产负债率
            if total_assets and total_liabilities:
                result['debt_to_asset_ratio'] = total_liabilities / total_assets

            # ROE = 净利润 / 净资产
            if result.get('net_profit') and equity and equity > 0:
                # 年化 (如果是季度数据)
                if result.get('report_period', '').endswith(('Q1', 'Q2', 'Q3')):
                    quarter = int(result['report_period'][-1])
                    annualized_profit = result['net_profit'] * 4 / quarter
                    result['roe_ttm'] = annualized_profit / equity
                else:
                    result['roe_ttm'] = result['net_profit'] / equity

        time.sleep(0.5)

        # 3. 现金流量表 - 获取经营活动现金流
        cash_df = ak.stock_financial_report_sina(stock=sina_code, symbol='现金流量表')
        if cash_df is not None and not cash_df.empty:
            latest = cash_df.iloc[0]

            # 经营活动现金流净额
            operating_cf = safe_float(latest.get('经营活动产生的现金流量净额'))

            # 投资支出 (购建固定资产等)
            capex = safe_float(latest.get('购建固定资产、无形资产和其他长期资产所支付的现金'))

            # 自由现金流 = 经营现金流 - 资本支出
            if operating_cf is not None:
                if capex:
                    result['free_cash_flow'] = operating_cf - abs(capex)
                else:
                    result['free_cash_flow'] = operating_cf

        # 4. 计算股息支付率 - 从分红数据获取
        try:
            # 使用 akshare 获取分红数据
            dividend_df = ak.stock_history_dividend_detail(symbol=symbol, indicator="分红")
            if dividend_df is not None and not dividend_df.empty:
                # 获取最近一年内的分红 (派息列是每10股派息金额)
                from datetime import timedelta
                one_year_ago = datetime.now() - timedelta(days=365)

                total_dividend_per_share = 0
                for _, row in dividend_df.iterrows():
                    try:
                        announce_date = pd.to_datetime(row.get('公告日期'))
                        if announce_date >= one_year_ago:
                            div_per_10_shares = safe_float(row.get('派息'))
                            if div_per_10_shares and div_per_10_shares > 0:
                                total_dividend_per_share += div_per_10_shares / 10  # 转换为每股
                    except:
                        continue

                # 股息支付率 = 每股分红 / 每股收益
                if total_dividend_per_share > 0:
                    eps = safe_float(profit_df.iloc[0].get('基本每股收益')) if profit_df is not None else None
                    # 如果是季度数据，年化EPS
                    if eps and result.get('report_period', '').endswith(('Q1', 'Q2', 'Q3')):
                        quarter = int(result['report_period'][-1])
                        eps = eps * 4 / quarter
                    if eps and eps > 0:
                        result['dividend_payout_ratio'] = total_dividend_per_share / eps
        except Exception as e:
            # 分红数据获取失败
            pass

        return result

    except Exception as e:
        print(f"  [ERROR] Failed to fetch data: {e}")
        return None


def update_quarterly_financials(conn, symbol: str, data: dict):
    """Update quarterly_financials table."""
    if not data or not data.get('report_period'):
        return False

    sql = """
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

    with conn.cursor() as cur:
        cur.execute(sql, (
            symbol,
            data.get('report_period'),
            datetime.now().strftime("%Y-%m-%d"),
            data.get('free_cash_flow'),
            data.get('debt_to_asset_ratio'),
            data.get('dividend_payout_ratio'),
            data.get('roe_ttm'),
            data.get('gross_margin'),
            data.get('revenue_growth_yoy'),
            data.get('net_profit_growth_yoy'),
        ))
    conn.commit()
    return True


def main():
    print("=" * 60)
    print("Fetching Real Financial Data")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    conn = get_connection()
    print("Connected to database.\n")

    for stock in STOCKS:
        print(f"\nProcessing {stock['symbol']} ({stock['name']})...")

        data = fetch_sina_financials(stock['sina_code'], stock['symbol'])

        if data:
            print(f"  Report Period: {data.get('report_period')}")
            print(f"  ROE: {data.get('roe_ttm', 0)*100:.2f}%" if data.get('roe_ttm') else "  ROE: N/A")
            print(f"  Debt Ratio: {data.get('debt_to_asset_ratio', 0)*100:.1f}%" if data.get('debt_to_asset_ratio') else "  Debt Ratio: N/A")
            print(f"  Gross Margin: {data.get('gross_margin', 0)*100:.1f}%" if data.get('gross_margin') else "  Gross Margin: N/A")
            print(f"  Free Cash Flow: {data.get('free_cash_flow', 0)/1e8:.1f}亿" if data.get('free_cash_flow') else "  FCF: N/A")
            print(f"  Revenue Growth YoY: {data.get('revenue_growth_yoy', 0)*100:.1f}%" if data.get('revenue_growth_yoy') is not None else "  Revenue Growth: N/A")
            print(f"  Net Profit Growth YoY: {data.get('net_profit_growth_yoy', 0)*100:.1f}%" if data.get('net_profit_growth_yoy') is not None else "  Profit Growth: N/A")
            print(f"  Dividend Payout Ratio: {data.get('dividend_payout_ratio', 0)*100:.1f}%" if data.get('dividend_payout_ratio') else "  Payout Ratio: N/A")

            if update_quarterly_financials(conn, stock['symbol'], data):
                print(f"  [OK] Updated database")
            else:
                print(f"  [WARN] Failed to update database")
        else:
            print(f"  [SKIP] No data available")

        time.sleep(1)

    print("\n" + "=" * 60)
    print("Complete!")
    print("=" * 60)

    conn.close()


if __name__ == "__main__":
    main()
