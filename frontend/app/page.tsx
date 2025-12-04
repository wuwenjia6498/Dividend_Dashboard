import { getDashboardData } from "./actions/getStocks";
import { DashboardClient } from "@/components/DashboardClient";

// Force dynamic rendering - disable caching for real-time data
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { stocks, stats } = await getDashboardData();

  return <DashboardClient stocks={stocks} stats={stats} />;
}
