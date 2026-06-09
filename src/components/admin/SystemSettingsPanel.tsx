"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SystemSettings } from "@/lib/db/schema";
import { updateSystemSettings } from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MODEL_PRESETS = [
  "grok-3",
  "grok-3-mini",
  "grok-2-1212",
  "grok-2-vision-1212",
  "grok-beta",
];

export function SystemSettingsPanel({ settings }: { settings: SystemSettings }) {
  const [aiModel, setAiModel] = useState(settings.aiModel);
  const [customModel, setCustomModel] = useState(
    MODEL_PRESETS.includes(settings.aiModel) ? "" : settings.aiModel
  );
  const [portalSubtitle, setPortalSubtitle] = useState(
    settings.portalSubtitle ?? "Internal Operations Portal"
  );
  const [portalSubtitleEnabled, setPortalSubtitleEnabled] = useState(
    settings.portalSubtitleEnabled
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const selectedPreset = MODEL_PRESETS.includes(aiModel) ? aiModel : "custom";

  const onSave = () => {
    startTransition(async () => {
      try {
        const model = selectedPreset === "custom" ? customModel.trim() : aiModel;
        if (!model) {
          toast.error("AI model is required");
          return;
        }
        await updateSystemSettings({
          aiModel: model,
          portalSubtitle,
          portalSubtitleEnabled,
        });
        toast.success("Settings saved");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save settings");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Settings</CardTitle>
        <CardDescription>
          Configure AI model and portal header text visible to all users.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>AI model</Label>
          <Select
            value={selectedPreset}
            onValueChange={(value) => {
              if (value === "custom") {
                setAiModel(customModel || "grok-3");
              } else {
                setAiModel(value);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_PRESETS.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
              <SelectItem value="custom">Custom model ID</SelectItem>
            </SelectContent>
          </Select>
          {selectedPreset === "custom" && (
            <Input
              value={customModel}
              onChange={(event) => setCustomModel(event.target.value)}
              placeholder="e.g. grok-3-fast"
            />
          )}
          <p className="text-xs text-muted-foreground">
            Used for landing AI chat and audit log analysis. Override default with{" "}
            <code>XAI_MODEL</code> env only before first settings row is created.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="portal-subtitle">Header subtitle</Label>
          <Input
            id="portal-subtitle"
            value={portalSubtitle}
            onChange={(event) => setPortalSubtitle(event.target.value)}
            disabled={!portalSubtitleEnabled}
          />
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium">Show header subtitle</p>
              <p className="text-xs text-muted-foreground">
                Controls the text next to the Nexus logo in the top bar.
              </p>
            </div>
            <Switch
              checked={portalSubtitleEnabled}
              onCheckedChange={setPortalSubtitleEnabled}
            />
          </div>
        </div>

        <Button onClick={onSave} disabled={isPending}>
          {isPending ? "Saving..." : "Save Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
