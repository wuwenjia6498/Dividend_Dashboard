"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ChartDataPoint {
  tradeDate: string;
  closePrice: number | null;
  dividendYieldTtm: number | null;
}

interface StockChartsProps {
  history: ChartDataPoint[];
  yieldPercentile80: number | null;
  yieldPercentile20: number | null;
}

export function StockCharts({
  history,
  yieldPercentile80,
  yieldPercentile20,
}: StockChartsProps) {
  // Format data for charts
  const chartData = history.map((item) => ({
    date: item.tradeDate,
    price: item.closePrice,
    yield: item.dividendYieldTtm,
  }));

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // Custom tooltip
  const PriceTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-lg shadow-lg p-3">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-sm text-blue-600">
            收盘价: ¥{payload[0]?.value?.toFixed(2) || "-"}
          </p>
        </div>
      );
    }
    return null;
  };

  const YieldTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-lg shadow-lg p-3">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-sm text-orange-600">
            股息率: {payload[0]?.value?.toFixed(2) || "-"}%
          </p>
        </div>
      );
    }
    return null;
  };

  if (chartData.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>暂无历史数据</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
      {/* Chart A: Price Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">股价走势</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `¥${value}`}
                  className="text-muted-foreground"
                  domain={["auto", "auto"]}
                />
                <Tooltip content={<PriceTooltip />} />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="收盘价"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Chart B: Dividend Yield Channel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">股息率通道</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `${value}%`}
                  className="text-muted-foreground"
                  domain={["auto", "auto"]}
                />
                <Tooltip content={<YieldTooltip />} />
                <Legend />

                {/* 80% Percentile Line (Opportunity Zone) */}
                {yieldPercentile80 !== null && (
                  <ReferenceLine
                    y={yieldPercentile80}
                    stroke="#22c55e"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    label={{
                      value: `机会线 ${yieldPercentile80.toFixed(2)}%`,
                      position: "right",
                      fill: "#22c55e",
                      fontSize: 12,
                    }}
                  />
                )}

                {/* 20% Percentile Line (Risk Zone) */}
                {yieldPercentile20 !== null && (
                  <ReferenceLine
                    y={yieldPercentile20}
                    stroke="#ef4444"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    label={{
                      value: `风险线 ${yieldPercentile20.toFixed(2)}%`,
                      position: "right",
                      fill: "#ef4444",
                      fontSize: 12,
                    }}
                  />
                )}

                <Line
                  type="monotone"
                  dataKey="yield"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={false}
                  name="股息率"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Legend explanation */}
          <div className="mt-4 flex gap-6 text-sm text-muted-foreground justify-center">
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-green-500" style={{ borderStyle: "dashed" }}></div>
              <span>🟢 机会线 (80%分位)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-red-500" style={{ borderStyle: "dashed" }}></div>
              <span>🔴 风险线 (20%分位)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
