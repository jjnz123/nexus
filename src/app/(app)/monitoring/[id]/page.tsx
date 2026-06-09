import { notFound } from "next/navigation";
import { DeviceDetail } from "@/components/monitoring/DeviceDetail";
import { getDeviceChecks, getMonitorDevice } from "@/server/actions/monitoring";

export default async function MonitorDevicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const device = await getMonitorDevice(id);
  if (!device) notFound();

  const [checks1h, checks24h, checks7d] = await Promise.all([
    getDeviceChecks(id, 1),
    getDeviceChecks(id, 24),
    getDeviceChecks(id, 24 * 7),
  ]);

  return (
    <DeviceDetail
      device={device}
      checksByRange={{
        1: checks1h,
        24: checks24h,
        168: checks7d,
      }}
    />
  );
}
