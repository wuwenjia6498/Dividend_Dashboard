-- Add indexes to optimize stock detail page performance
-- These indexes will significantly speed up queries for historical data

-- Index for daily_metrics table (most critical)
-- This composite index optimizes queries filtering by symbol and ordering by trade_date
CREATE INDEX IF NOT EXISTS idx_daily_metrics_symbol_date
ON daily_metrics(symbol, trade_date);

-- Additional index for symbol lookups
CREATE INDEX IF NOT EXISTS idx_daily_metrics_symbol
ON daily_metrics(symbol);

-- Index for quarterly_financials table
CREATE INDEX IF NOT EXISTS idx_quarterly_financials_symbol_period
ON quarterly_financials(symbol, report_period DESC);

-- Analyze tables to update statistics for query planner
ANALYZE daily_metrics;
ANALYZE quarterly_financials;
ANALYZE stock_meta;
