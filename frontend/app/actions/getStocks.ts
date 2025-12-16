"use server";

import { db } from "@/db";
import { stockMeta, dailyMetrics } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export interface StockDashboardItem {
  symbol: string;
  name: string;
  sector: string | null;
  closePrice: number | null;
  dividendYieldTtm: number | null;
  yieldPercentile: number | null;
  pePercentile: number | null;
  tradeDate: string | null;
}

export interface DashboardStats {
  totalStocks: number;
  avgDividendYield: number;
}

export interface DashboardData {
  stocks: StockDashboardItem[];
  stats: DashboardStats;
}

/**
 * Get dashboard data: all active stocks with their latest daily metrics
 * Sorted by yield_percentile descending (best opportunities first)
 *
 * Uses PostgreSQL window function to efficiently get the latest record for each stock.
 */
export async function getDashboardData(): Promise<DashboardData> {
  // Use PostgreSQL window function ROW_NUMBER() to get the latest record for each stock
  // This is done entirely in the database for optimal performance
  const latestMetrics = await db.execute(sql`
    SELECT DISTINCT ON (symbol)
      symbol,
      trade_date,
      close_price,
      dividend_yield_ttm,
      yield_percentile,
      pe_percentile
    FROM daily_metrics
    WHERE symbol IS NOT NULL
    ORDER BY symbol, trade_date DESC
  `);

  // Create a map for quick lookup
  const metricsMap = new Map(
    latestMetrics.rows.map((m: any) => [
      m.symbol,
      {
        symbol: m.symbol,
        tradeDate: m.trade_date,
        closePrice: m.close_price,
        dividendYieldTtm: m.dividend_yield_ttm,
        yieldPercentile: m.yield_percentile,
        pePercentile: m.pe_percentile,
      },
    ])
  );

  // Get all active stocks
  const activeStocks = await db
    .select({
      symbol: stockMeta.symbol,
      name: stockMeta.name,
      sector: stockMeta.sector,
    })
    .from(stockMeta)
    .where(eq(stockMeta.isActive, true));

  // Merge stock metadata with their latest metrics
  const stocks: StockDashboardItem[] = activeStocks
    .map((stock) => {
      const metrics = metricsMap.get(stock.symbol);
      return {
        symbol: stock.symbol,
        name: stock.name,
        sector: stock.sector,
        closePrice: metrics?.closePrice ? parseFloat(metrics.closePrice) : null,
        dividendYieldTtm: metrics?.dividendYieldTtm ? parseFloat(metrics.dividendYieldTtm) : null,
        yieldPercentile: metrics?.yieldPercentile ? parseFloat(metrics.yieldPercentile) : null,
        pePercentile: metrics?.pePercentile ? parseFloat(metrics.pePercentile) : null,
        tradeDate: metrics?.tradeDate || null,
      };
    })
    // Sort by dividend yield (TTM) descending (highest yield first)
    .sort((a, b) => (b.dividendYieldTtm || 0) - (a.dividendYieldTtm || 0));

  // Calculate stats
  const stocksWithYield = stocks.filter((s) => s.dividendYieldTtm !== null);
  const avgDividendYield =
    stocksWithYield.length > 0
      ? stocksWithYield.reduce((sum, s) => sum + (s.dividendYieldTtm || 0), 0) /
        stocksWithYield.length
      : 0;

  return {
    stocks,
    stats: {
      totalStocks: stocks.length,
      avgDividendYield: Math.round(avgDividendYield * 100) / 100,
    },
  };
}
