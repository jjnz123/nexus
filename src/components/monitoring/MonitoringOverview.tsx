"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDistanceToNow } from "date-fns";
import { Activity, Clock3, PlusCircle, ServerCrash, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MonitorCheck, MonitorDevice } from "@/lib/db/schema";
import { DeviceFormDialog } from "./DeviceFormDialog";
import { DiscoverDevicesDialog } from "./DiscoverDevicesDialog";

type DeviceWithChecks = {
  device: MonitorDevice;
  checks: MonitorCheck[];
  lastCheck: MonitorCheck | null;
};

type MonitoringStats = {
  total: number;
  up: number;
  down: number;
  unknown: number;
};

function statusColor(status: MonitorDevice["lastStatus"] | MonitorCheck["status"] | null) {
  if (status === "up") return "bg-emerald-500";
  if (status === "down") return "bg-red-500";
  return "bg-amber-500";
}

function statusBadgeVariant(status: MonitorDevice["lastStatus"] | MonitorCheck["status"] | null) {
  if (status === "up") return "default";
  if (status === "down") return "destructive";
  return "secondary";
}

function getSparklineData(checks: MonitorCheck[]) {
  return [...checks]
    .reverse()
    .map((check, idx) => ({
      idx,
      latency: check.latencyMs ?? 0,
      status: check.status,
    }));
}

export function MonitoringOverview({
  devices,
  stats,
}: {
  devices: DeviceWithChecks[];
  stats: MonitoringStats;
}) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Monitoring</h1>
          <p className="text-sm text-muted-foreground">
            Track uptime, latency, and the latest checks across monitored targets.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DiscoverDevicesDialog onComplete={() => router.refresh()} />
          <DeviceFormDialog
            trigger={
              <Button className="gap-2">
                <PlusCircle className="h-4 w-4" />
                Add Device
              </Button>
            }
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Devices</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Configured monitor targets</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              Up
            </CardDescription>
            <CardTitle className="text-2xl text-emerald-600">{stats.up}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Responding successfully</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <ServerCrash className="h-4 w-4 text-red-500" />
              Down
            </CardDescription>
            <CardTitle className="text-2xl text-red-600">{stats.down}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Latest check is failing</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <ShieldQuestion className="h-4 w-4 text-amber-500" />
              Unknown
            </CardDescription>
            <CardTitle className="text-2xl text-amber-600">{stats.unknown}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">No recent status available</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {devices.map(({ device, checks, lastCheck }) => {
          const chartData = getSparklineData(checks);
          return (
            <Card key={device.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <motion.span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${statusColor(lastCheck?.status ?? device.lastStatus ?? null)}`}
                        animate={
                          (lastCheck?.status ?? device.lastStatus) === "down"
                            ? { scale: [1, 1.25, 1], opacity: [0.75, 1, 0.75] }
                            : { scale: 1, opacity: 1 }
                        }
                        transition={{ duration: 1.25, repeat: Infinity, ease: "easeInOut" }}
                      />
                      {device.name}
                    </CardTitle>
                    <CardDescription className="truncate">{device.target}</CardDescription>
                  </div>
                  <Badge variant={statusBadgeVariant(lastCheck?.status ?? device.lastStatus ?? null)}>
                    {(lastCheck?.status ?? device.lastStatus ?? "unknown").toUpperCase()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-24 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id={`latency-${device.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" className="opacity-25" />
                      <XAxis dataKey="idx" hide />
                      <YAxis hide />
                      <Tooltip
                        formatter={(value) => [`${value} ms`, "Latency"]}
                        labelFormatter={() => "Recent check"}
                        contentStyle={{ borderRadius: 8 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="latency"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        fill={`url(#latency-${device.id})`}
                        connectNulls
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Activity className="h-3.5 w-3.5" />
                    Last latency:{" "}
                    <span className="font-medium text-foreground">
                      {lastCheck?.latencyMs != null ? `${lastCheck.latencyMs} ms` : "-"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 justify-end">
                    <Clock3 className="h-3.5 w-3.5" />
                    {lastCheck
                      ? formatDistanceToNow(new Date(lastCheck.checkedAt), {
                          addSuffix: true,
                        })
                      : "No checks yet"}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <DeviceFormDialog
                    device={device}
                    trigger={
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    }
                  />
                  <Button asChild size="sm">
                    <Link href={`/monitoring/${device.id}`}>Open Details</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
