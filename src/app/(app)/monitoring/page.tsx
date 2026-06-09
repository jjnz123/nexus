import { getDevicesWithRecentChecks, getMonitoringStats } from "@/server/actions/monitoring";
import { MonitoringOverview } from "@/components/monitoring/MonitoringOverview";

export default async function MonitoringPage() {
  const [devices, stats] = await Promise.all([
    getDevicesWithRecentChecks(),
    getMonitoringStats(),
  ]);

  return <MonitoringOverview devices={devices} stats={stats} />;
}
