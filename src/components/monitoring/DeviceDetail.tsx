"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import { Activity, ArrowLeft, Gauge, PlayCircle } from "lucide-react";
import {
  LineChart,
  Line,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { forceDeviceCheck } from "@/server/actions/monitoring";
import type { MonitorCheck, MonitorDevice } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeviceFormDialog } from "./DeviceFormDialog";

const ranges = [
  { label: "1h", hours: 1 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 24 * 7 },
] as const;

function statusVariant(status: MonitorCheck["status"] | MonitorDevice["lastStatus"] | null) {
  if (status === "up") return "default";
  if (status === "down") return "destructive";
  return "secondary";
}

export function DeviceDetail({
  device,
  checksByRange,
  canConfigureMonitoring = false,
}: {
  device: MonitorDevice;
  checksByRange: Record<number, MonitorCheck[]>;
  canConfigureMonitoring?: boolean;
}) {
  const [selectedRange, setSelectedRange] = useState<number>(24);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const chartData = useMemo(() => {
    const rangeChecks = checksByRange[selectedRange] ?? [];
    return [...rangeChecks]
      .reverse()
      .map((check) => ({
        checkedAt: format(
          new Date(check.checkedAt),
          selectedRange <= 24 ? "HH:mm" : "MMM d HH:mm"
        ),
        latency: check.latencyMs ?? 0,
        status: check.status,
        error: check.error,
      }));
  }, [checksByRange, selectedRange]);

  const checks = checksByRange[selectedRange] ?? [];

  const lastCheck = checks[0] ?? null;

  const onForceCheck = () => {
    startTransition(async () => {
      try {
        await forceDeviceCheck(device.id);
        toast.success("Check queued");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to trigger check");
      }
    });
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
        <Link href="/monitoring">
          <ArrowLeft className="h-4 w-4" />
          Back to monitoring
        </Link>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{device.name}</h1>
          <p className="text-sm text-muted-foreground">{device.target}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(lastCheck?.status ?? device.lastStatus)}>
            {(lastCheck?.status ?? device.lastStatus ?? "unknown").toUpperCase()}
          </Badge>
          {canConfigureMonitoring ? (
            <DeviceFormDialog
              device={device}
              onDeleted={() => router.push("/monitoring")}
              trigger={
                <Button variant="outline" size="sm">
                  Edit
                </Button>
              }
            />
          ) : null}
          <Button onClick={onForceCheck} disabled={isPending} className="gap-2">
            <PlayCircle className="h-4 w-4" />
            {isPending ? "Running..." : "Force Check Now"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              Latency Trend
            </CardTitle>
            <CardDescription>Observed response times over the selected time range.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {ranges.map((range) => (
              <Button
                key={range.hours}
                size="sm"
                variant={selectedRange === range.hours ? "default" : "outline"}
                onClick={() => setSelectedRange(range.hours)}
              >
                {range.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-25" />
                <XAxis dataKey="checkedAt" tick={{ fontSize: 12 }} minTickGap={24} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => [`${value} ms`, "Latency"]}
                  contentStyle={{ borderRadius: 8 }}
                />
                <Line
                  type="monotone"
                  dataKey="latency"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent Checks
          </CardTitle>
          <CardDescription>
            Latest checks first, including status, measured latency, and errors.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Timestamp</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Latency</th>
                  <th className="py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {checks.slice(0, 100).map((check) => (
                  <tr key={check.id} className="border-b">
                    <td className="py-2 pr-3">{format(new Date(check.checkedAt), "MMM d, HH:mm:ss")}</td>
                    <td className="py-2 pr-3">
                      <Badge variant={statusVariant(check.status)}>{check.status.toUpperCase()}</Badge>
                    </td>
                    <td className="py-2 pr-3">{check.latencyMs != null ? `${check.latencyMs} ms` : "-"}</td>
                    <td className="py-2">{check.error ?? "-"}</td>
                  </tr>
                ))}
                {checks.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground">
                      No checks found for this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
