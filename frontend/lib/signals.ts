/**
 * Determine signal status based on yield percentile
 * PRD规则:
 * - 🟢 机会区 (Buy): 分位点 > 80%
 * - 🔴 风险区 (Sell): 分位点 < 20%
 * - 🟡 持有区 (Hold): 其他
 */
export function getSignalStatus(yieldPercentile: number | null): {
  signal: "buy" | "sell" | "hold";
  label: string;
  color: "green" | "red" | "yellow";
} {
  if (yieldPercentile === null) {
    return { signal: "hold", label: "无数据", color: "yellow" };
  }

  if (yieldPercentile > 80) {
    return { signal: "buy", label: "低估/机会", color: "green" };
  }

  if (yieldPercentile < 20) {
    return { signal: "sell", label: "高估/风险", color: "red" };
  }

  return { signal: "hold", label: "合理", color: "yellow" };
}
