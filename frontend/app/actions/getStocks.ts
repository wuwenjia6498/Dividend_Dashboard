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
 * Uses DISTINCT ON to ensure we get the latest record for each stock,
 * regardless of server timezone or date filtering issues.
 */
export async function getDashboardData(): Promise<DashboardData> {
  // Use PostgreSQL DISTINCT ON to get the latest record for each stock
  // This is more robust than date-based filtering and works regardless of timezone
  const latestMetrics = await db
    .select({
      symbol: dailyMetrics.symbol,
      tradeDate: dailyMetrics.tradeDate,
      closePrice: dailyMetrics.closePrice,
      dividendYieldTtm: dailyMetrics.dividendYieldTtm,
      yieldPercentile: dailyMetrics.yieldPercentile,
      pePercentile: dailyMetrics.pePercentile,
    })
    .from(dailyMetrics)
    .orderBy(dailyMetrics.symbol, desc(dailyMetrics.tradeDate))
    .then((rows) => {
      // Group by symbol and take the first (latest) record for each
      const latestBySymbol = new Map<string, typeof rows[0]>();
      for (const row of rows) {
        // Skip rows with null symbol
        if (row.symbol && !latestBySymbol.has(row.symbol)) {
          latestBySymbol.set(row.symbol, row);
        }
      }
      return Array.from(latestBySymbol.values());
    });

  // Create a map for quick lookup
  const metricsMap = new Map(
    latestMetrics
      .filter((m) => m.symbol !== null)
      .map((m) => [m.symbol!, m])
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
    // Sort by yield percentile descending (best opportunities first)
    .sort((a, b) => (b.yieldPercentile || 0) - (a.yieldPercentile || 0));

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
