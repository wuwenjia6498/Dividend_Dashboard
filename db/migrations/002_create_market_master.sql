-- Create market_master table for storing all A-share stocks
-- This table is used for autocomplete and search functionality

CREATE TABLE IF NOT EXISTS market_master (
    symbol VARCHAR(20) PRIMARY KEY,        -- 股票代码 (如: 600036)
    name VARCHAR(50) NOT NULL,             -- 股票名称 (如: 招商银行)
    sector VARCHAR(50),                    -- 所属行业 (如: 银行)
    list_status VARCHAR(10) DEFAULT 'L',   -- 上市状态 ('L' = 上市中)
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for fast fuzzy search
CREATE INDEX IF NOT EXISTS idx_market_master_name ON market_master(name);
CREATE INDEX IF NOT EXISTS idx_market_master_symbol ON market_master(symbol);

-- Add comment
COMMENT ON TABLE market_master IS '全市场股票清单，用于搜索和自动补全';
