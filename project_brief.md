# 项目名称：高股息与基本面量化投资看板 (Current Architecture)

## 1. 项目概况
这是一个已上线运行的自动化投资辅助工具，基于 Next.js 和 Python 构建。
* **线上地址：** Vercel 部署 (前端)
* **运行状态：** GitHub Actions 每日定时运行 ETL 脚本 (后端)
* **核心策略：** 基于“股息率分位点”进行择时，结合“经营现金流”进行排雷。

## 2. 技术栈 (已定型)
* **前端：** Next.js 14 (App Router), TypeScript, Tailwind CSS, Shadcn UI, Recharts。
    * *关键配置：* 首页强制动态渲染 (`dynamic = 'force-dynamic'`)，详情页使用 `unstable_cache` 缓存历史数据。
* **后端/数据处理：** Python 3.11。
    * *数据源：* **Tushare Pro API** (Token 已配置)。
    * *运行环境：* GitHub Actions (每日 20:00 自动触发) 或 本地手动触发。
* **数据库：** PostgreSQL (Supabase/Neon)。
    * *ORM：* Drizzle ORM。

## 3. 核心业务逻辑 (关键规则)

### 3.1 选股与排雷 (基本面)
* **现金流口径：** **强制使用“经营活动现金净流量 (OCF)”**，不使用“自由现金流 (FCF)”。
    * *原因：* 避免公用事业/银行/运营商因资本开支大导致 FCF 为负的误报。
* **股息支付率：** 使用公式 `PE_TTM * (Dividend_Yield_TTM / 100)` 计算，不直接取接口数据。
* **数据清洗：**
    * 忽略 Tushare 返回的异常尖刺 (Spikes)。
    * 忽略 1900/1999 年等无效历史数据。
* **成长指标：** 存入数据库前需除以 100 (将 2.2 转换为 0.022)。

### 3.2 择时与信号 (红绿灯)
* **分位点计算：** 必须基于过去 **5 年 (约 1250 个交易日)** 的完整历史数据计算。
* **图表展示：** 为了性能，前端图表只渲染 **最近 2 年** 的数据，但在标题处标注“分位点基于 5 年计算”。
* **信号阈值：**
    * 🟢 机会: 分位点 > 80%
    * 🔴 风险: 分位点 < 20%
    * 🟡 合理: 其他

## 4. 数据库设计 (Current Schema)

```sql
-- 1. 股票基础信息表 (Watchlist)
CREATE TABLE stock_meta (
    symbol VARCHAR(20) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    sector VARCHAR(50),
    is_active BOOLEAN DEFAULT true, -- 软删除标志
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. 全市场股票清单 (用于搜索补全)
CREATE TABLE market_master (
    symbol VARCHAR(20) PRIMARY KEY,
    name VARCHAR(50),
    sector VARCHAR(50),
    list_status VARCHAR(10) -- 只存 'L' (上市中)
);

-- 3. 日频估值表
CREATE TABLE daily_metrics (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) REFERENCES stock_meta(symbol),
    trade_date DATE NOT NULL,
    close_price DECIMAL(10, 2),
    pe_ttm DECIMAL(10, 2),
    dividend_yield_ttm DECIMAL(10, 4), -- 核心指标
    yield_percentile DECIMAL(5, 2),    -- 核心计算结果 (0-100)
    UNIQUE(symbol, trade_date)
);

-- 4. 季频财务表
CREATE TABLE quarterly_financials (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) REFERENCES stock_meta(symbol),
    report_period VARCHAR(20),
    publish_date DATE,
    free_cash_flow DECIMAL(20, 2), -- 注意：实为经营现金流 (OCF)
    dividend_payout_ratio DECIMAL(10, 4),
    roe_ttm DECIMAL(10, 4),
    revenue_growth_yoy DECIMAL(10, 4), -- 已除以100存为小数
    net_profit_growth_yoy DECIMAL(10, 4), -- 已除以100存为小数
    UNIQUE(symbol, report_period)
);
```

## 5. 已实现功能 (Implemented Features)
1. **股票管理：**
    * 支持通过弹窗搜索添加 (自动补全代码和行业)。
    * 支持列表移除 (软删除)。

2. **数据更新 (ETL)：**
    * 目前仅支持全量更新：`python update_data.py` (每天 20:00 定时运行)，不支持单只触发。
    * 支持 `python sync_market.py` 同步全市场名单。
    * 集成重试机制 (Retry) 和速率限制。

3. **可视化：**
    * 首页：红绿灯信号看板 (强制动态渲染，无视时区差异)。
    * 详情页：股息率通道图 (含机会/风险线)、财务体检卡片 (含 Tooltip 注解)。

## 6. 待办/维护计划 (Next Steps)
* [优先级 High] 开发单只股票即时更新模式 (Single Stock Update Pipeline)。
* 监控 Vercel 上的数据时效性。
* 持续优化 Tushare 数据源的稳定性。