"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { MonitorDevice } from "@/lib/db/schema";
import {
  createMonitorDevice,
  deleteMonitorDevice,
  updateMonitorDevice,
} from "@/server/actions/monitoring";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type DeviceInputState = {
  name: string;
  target: string;
  checkType: "ping" | "tcp" | "http";
  intervalSec: number;
  timeoutMs: number;
  enabled: boolean;
};

function initialValues(device?: MonitorDevice): DeviceInputState {
  return {
    name: device?.name ?? "",
    target: device?.target ?? "",
    checkType: device?.checkType ?? "ping",
    intervalSec: device?.intervalSec ?? 60,
    timeoutMs: device?.timeoutMs ?? 5000,
    enabled: device?.enabled ?? true,
  };
}

export function DeviceFormDialog({
  device,
  trigger,
  onDeleted,
}: {
  device?: MonitorDevice;
  trigger: React.ReactNode;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DeviceInputState>(initialValues(device));
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isEdit = Boolean(device);

  const reset = () => setState(initialValues(device));

  const onSubmit = () => {
    if (!state.name.trim() || !state.target.trim()) {
      toast.error("Name and target are required");
      return;
    }

    startTransition(async () => {
      try {
        if (isEdit && device) {
          await updateMonitorDevice({
            id: device.id,
            name: state.name.trim(),
            target: state.target.trim(),
            checkType: state.checkType,
            intervalSec: state.intervalSec,
            timeoutMs: state.timeoutMs,
            enabled: state.enabled,
          });
          toast.success("Device updated");
        } else {
          await createMonitorDevice({
            name: state.name.trim(),
            target: state.target.trim(),
            checkType: state.checkType,
            intervalSec: state.intervalSec,
            timeoutMs: state.timeoutMs,
            enabled: state.enabled,
          });
          toast.success("Device created");
        }
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save device");
      }
    });
  };

  const onDelete = () => {
    if (!device) return;
    startTransition(async () => {
      try {
        await deleteMonitorDevice(device.id);
        toast.success("Device deleted");
        setOpen(false);
        onDeleted?.();
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete device");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Monitor Device" : "Create Monitor Device"}</DialogTitle>
          <DialogDescription>
            Configure the endpoint and check behavior for this monitored device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="device-name">Name</Label>
            <Input
              id="device-name"
              value={state.name}
              onChange={(event) => setState((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="API Gateway"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="device-target">Target</Label>
            <Input
              id="device-target"
              value={state.target}
              onChange={(event) => setState((prev) => ({ ...prev, target: event.target.value }))}
              placeholder="https://api.example.com/health"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Check Type</Label>
              <Select
                value={state.checkType}
                onValueChange={(value: "ping" | "tcp" | "http") =>
                  setState((prev) => ({ ...prev, checkType: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ping">Ping</SelectItem>
                  <SelectItem value="tcp">TCP</SelectItem>
                  <SelectItem value="http">HTTP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="device-interval">Interval (seconds)</Label>
              <Input
                id="device-interval"
                type="number"
                min={10}
                max={3600}
                value={state.intervalSec}
                onChange={(event) =>
                  setState((prev) => ({ ...prev, intervalSec: Number(event.target.value) || 60 }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="device-timeout">Timeout (ms)</Label>
              <Input
                id="device-timeout"
                type="number"
                min={1000}
                max={30000}
                value={state.timeoutMs}
                onChange={(event) =>
                  setState((prev) => ({ ...prev, timeoutMs: Number(event.target.value) || 5000 }))
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Enabled</p>
                <p className="text-xs text-muted-foreground">Run checks on schedule</p>
              </div>
              <Switch
                checked={state.enabled}
                onCheckedChange={(checked) => setState((prev) => ({ ...prev, enabled: checked }))}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            <div>
              {isEdit && (
                <Button variant="destructive" onClick={onDelete} disabled={isPending}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              )}
            </div>
            <Button onClick={onSubmit} disabled={isPending}>
              {isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Device"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
