import {
  pgTable,
  varchar,
  boolean,
  timestamp,
  serial,
  date,
  decimal,
  unique,
} from "drizzle-orm/pg-core";

// Stock Meta - Basic stock information (Watchlist)
export const stockMeta = pgTable("stock_meta", {
  symbol: varchar("symbol", { length: 20 }).primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  sector: varchar("sector", { length: 50 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Daily Metrics - Daily valuations and quotes
export const dailyMetrics = pgTable(
  "daily_metrics",
  {
    id: serial("id").primaryKey(),
    symbol: varchar("symbol", { length: 20 }).references(() => stockMeta.symbol),
    tradeDate: date("trade_date").notNull(),

    // Market data
    closePrice: decimal("close_price", { precision: 10, scale: 2 }),
    marketCap: decimal("market_cap", { precision: 15, scale: 2 }),

    // Core valuation metrics
    peTtm: decimal("pe_ttm", { precision: 10, scale: 2 }),
    pbTtm: decimal("pb_ttm", { precision: 10, scale: 2 }),
    dividendYieldTtm: decimal("dividend_yield_ttm", { precision: 10, scale: 4 }),

    // Historical percentiles (0-100)
    pePercentile: decimal("pe_percentile", { precision: 5, scale: 2 }),
    pbPercentile: decimal("pb_percentile", { precision: 5, scale: 2 }),
    yieldPercentile: decimal("yield_percentile", { precision: 5, scale: 2 }),
  },
  (table) => [unique().on(table.symbol, table.tradeDate)]
);

// Quarterly Financials - Financial health metrics
export const quarterlyFinancials = pgTable(
  "quarterly_financials",
  {
    id: serial("id").primaryKey(),
    symbol: varchar("symbol", { length: 20 }).references(() => stockMeta.symbol),
    reportPeriod: varchar("report_period", { length: 20 }).notNull(),
    publishDate: date("publish_date"),

    // Risk indicators
    freeCashFlow: decimal("free_cash_flow", { precision: 15, scale: 2 }),
    debtToAssetRatio: decimal("debt_to_asset_ratio", { precision: 10, scale: 4 }),
    dividendPayoutRatio: decimal("dividend_payout_ratio", { precision: 10, scale: 4 }),

    // Quality indicators
    roeTtm: decimal("roe_ttm", { precision: 10, scale: 4 }),
    grossMargin: decimal("gross_margin", { precision: 10, scale: 4 }),
    revenueGrowthYoy: decimal("revenue_growth_yoy", { precision: 10, scale: 4 }),
    netProfitGrowthYoy: decimal("net_profit_growth_yoy", { precision: 10, scale: 4 }),
  },
  (table) => [unique().on(table.symbol, table.reportPeriod)]
);

// TypeScript types
export type StockMeta = typeof stockMeta.$inferSelect;
export type DailyMetrics = typeof dailyMetrics.$inferSelect;
export type QuarterlyFinancials = typeof quarterlyFinancials.$inferSelect;
