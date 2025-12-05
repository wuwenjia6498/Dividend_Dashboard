import { getDashboardData } from "./actions/getStocks";
import { DashboardClient } from "@/components/DashboardClient";

// Force dynamic rendering - disable caching for real-time data
export const dynamic = 'force-dynamic';

// Increase timeout for server actions (adding stocks, fetching data)
export const maxDuration = 120; // 2 minutes

export default async function DashboardPage() {
  const { stocks, stats } = await getDashboardData();

  return <DashboardClient stocks={stocks} stats={stats} />;
}
