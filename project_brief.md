# 项目名称：高股息与基本面量化投资看板 (High Dividend & Fundamental Monitor)

## 1. 项目目标
构建一个自动化的投资辅助工具，旨在帮助用户管理高股息股票池。核心逻辑是：
1.  **选股（基本面）：** 不仅看股息率，还要看 ROE、自由现金流等指标，确保分红可持续。
2.  **择时（估值）：** 基于股息率和 PE/PB 的历史分位点，自动判断当前价格是“低估”还是“高估”。
3.  **自动化：** 每日自动抓取 A 股数据，更新指标，无需人工维护。

## 2. 技术栈架构
* **前端：** Next.js (App Router), TypeScript, Tailwind CSS, Shadcn UI, Recharts (图表)。
* **后端/API：** Next.js Server Actions (直接读取数据库)。
* **数据库：** PostgreSQL (Schema 见下文)。
* **ORM：** Drizzle ORM (用于 TS) 或直接 SQL。
* **数据处理 (ETL)：** Python 脚本 (独立运行)，使用 `AkShare` 库抓取数据，处理后存入 PG 数据库。

## 3. 核心业务逻辑

### 3.1 数据分层
系统数据分为两类，更新频率不同：
1.  **日频数据 (Daily):** 股价、市值、PE_TTM、PB_TTM、股息率_TTM。
    * *关键计算：* 每日需计算当前指标在过去 5 年历史中的**百分位点 (Percentile)**。
2.  **季频数据 (Quarterly):** 营收增速、净利润增速、ROE、毛利率、自由现金流、负债率、分红支付率。

### 3.2 信号系统 (核心功能)
前端需展示类似“红绿灯”的信号：
* **🟢 机会区 (Buy):** 股息率分位点 > 80% 且 基本面健康 (自由现金流 > 0)。
* **🔴 风险区 (Sell):** 股息率分位点 < 20% 或 支付率 > 100% (不可持续)。
* **🟡 持有区 (Hold):** 介于两者之间。

## 4. 数据库设计 (Schema)
请基于以下 SQL 结构进行开发：

```sql
-- 1. 股票基础信息表 (Watchlist)
CREATE TABLE stock_meta (
    symbol VARCHAR(20) PRIMARY KEY,  -- 股票代码 (如: 600036.SH)
    name VARCHAR(50) NOT NULL,       -- 股票名称 (如: 招商银行)
    sector VARCHAR(50),              -- 所属行业 (如: 银行)
    is_active BOOLEAN DEFAULT true,  -- 是否在当前的监控列表中
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. 日频估值与行情表 (Daily Valuations)
-- 每天收盘后更新
CREATE TABLE daily_metrics (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) REFERENCES stock_meta(symbol),
    trade_date DATE NOT NULL,

    -- 【行情数据】
    close_price DECIMAL(10, 2),      -- 收盘价
    market_cap DECIMAL(15, 2),       -- 总市值

    -- 【核心估值指标】
    pe_ttm DECIMAL(10, 2),           -- 市盈率 TTM
    pb_ttm DECIMAL(10, 2),           -- 市净率
    dividend_yield_ttm DECIMAL(10, 4), -- 滚动股息率 (核心)

    -- 【历史分位点 (0-100)】
    pe_percentile DECIMAL(5, 2),     
    pb_percentile DECIMAL(5, 2),     
    yield_percentile DECIMAL(5, 2),  -- 股息率分位点 (越高越好)

    UNIQUE(symbol, trade_date)
);

-- 3. 季频财务指标表 (Quarterly Financials)
-- 基本面体检报告
CREATE TABLE quarterly_financials (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) REFERENCES stock_meta(symbol),
    report_period VARCHAR(20) NOT NULL, -- 财报周期 (如: '2023Q3')
    publish_date DATE,                  -- 发布日期

    -- 【排雷指标】
    free_cash_flow DECIMAL(15, 2),      -- 自由现金流 (必须关注)
    debt_to_asset_ratio DECIMAL(10, 4), -- 资产负债率
    dividend_payout_ratio DECIMAL(10, 4),-- 股息支付率

    -- 【优选指标】
    roe_ttm DECIMAL(10, 4),             -- ROE
    gross_margin DECIMAL(10, 4),        -- 毛利率
    revenue_growth_yoy DECIMAL(10, 4),  -- 营收增速
    net_profit_growth_yoy DECIMAL(10, 4),-- 净利增速

    UNIQUE(symbol, report_period)
);
```

## 5. 开发任务清单 (Roadmap)
请按照以下顺序辅助我进行开发：
1.  **环境搭建：** 初始化 Next.js 项目，配置 PostgreSQL 数据库连接。
2.  **ETL 开发 (Python)：** 编写 `update_data.py`，实现从 AkShare 抓取数据、清洗、计算分位点、写入数据库的完整流程。
3.  **API/数据层：** 在 Next.js 中编写读取数据库的 Service 层。
4.  **前端实现：**
    * **Dashboard:** 列表展示股票池，高亮显示“红绿灯”状态。
    * **详情页:** 展示股价走势图 + 股息率通道图 + 财务指标雷达图。