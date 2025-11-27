"use server";

import { db } from "@/db";
import { marketMaster } from "@/db/schema";
import { or, ilike, sql } from "drizzle-orm";

export interface SearchResult {
  symbol: string;
  name: string;
  sector: string | null;
}

/**
 * Search stocks by symbol or name with fuzzy matching
 * @param query - Search query (can be symbol or name)
 * @returns Array of matching stocks (max 10 results)
 */
export async function searchStocks(query: string): Promise<SearchResult[]> {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const searchTerm = `%${query.trim()}%`;

  try {
    const results = await db
      .select({
        symbol: marketMaster.symbol,
        name: marketMaster.name,
        sector: marketMaster.sector,
      })
      .from(marketMaster)
      .where(
        or(
          ilike(marketMaster.symbol, searchTerm),
          ilike(marketMaster.name, searchTerm)
        )
      )
      .limit(10);

    return results;
  } catch (error) {
    console.error("Error searching stocks:", error);
    return [];
  }
}

/**
 * Get stock details by exact symbol match
 * @param symbol - Stock symbol
 * @returns Stock details or null
 */
export async function getStockBySymbol(
  symbol: string
): Promise<SearchResult | null> {
  try {
    const result = await db
      .select({
        symbol: marketMaster.symbol,
        name: marketMaster.name,
        sector: marketMaster.sector,
      })
      .from(marketMaster)
      .where(sql`${marketMaster.symbol} = ${symbol}`)
      .limit(1);

    return result[0] || null;
  } catch (error) {
    console.error("Error getting stock by symbol:", error);
    return null;
  }
}
