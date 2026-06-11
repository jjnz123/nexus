"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import type { SystemSettings } from "@/lib/db/schema";
import { sendTestEmail, updateSystemSettings } from "@/server/actions/settings";
import { BackupRestorePanel } from "@/components/admin/BackupRestorePanel";
import {
  DEFAULT_RECORDING_BITRATE_KBPS,
  DEFAULT_RECORDING_MIME_TYPE,
  MAX_RECORDING_BITRATE_KBPS,
  MIN_RECORDING_BITRATE_KBPS,
  RECORDING_FORMAT_PRESETS,
} from "@/lib/recording";
import { Badge } from "@/components/ui/badge";
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

export function SystemSettingsPanel({
  settings,
  emailConfigured,
  defaultTestEmail,
}: {
  settings: SystemSettings;
  emailConfigured: boolean;
  defaultTestEmail: string;
}) {
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
  const [showVersionInHeader, setShowVersionInHeader] = useState(
    settings.showVersionInHeader
  );
  const [recordingAudioMimeType, setRecordingAudioMimeType] = useState(
    settings.recordingAudioMimeType ?? DEFAULT_RECORDING_MIME_TYPE
  );
  const [recordingAudioBitrateKbps, setRecordingAudioBitrateKbps] = useState(
    settings.recordingAudioBitrateKbps ?? DEFAULT_RECORDING_BITRATE_KBPS
  );
  const [testEmailTo, setTestEmailTo] = useState(defaultTestEmail);
  const [isPending, startTransition] = useTransition();
  const [isEmailPending, startEmailTransition] = useTransition();
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
          showVersionInHeader,
          recordingAudioMimeType,
          recordingAudioBitrateKbps,
        });
        toast.success("Settings saved");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save settings");
      }
    });
  };

  const onSendTestEmail = () => {
    startEmailTransition(async () => {
      try {
        const result = await sendTestEmail({ to: testEmailTo.trim() || undefined });
        toast.success(`Test email sent to ${result.to}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to send test email");
      }
    });
  };

  return (
    <div className="space-y-6">
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
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium">Show version number in header</p>
              <p className="text-xs text-muted-foreground">
                Appends the Nexus release version next to the header subtitle (e.g. v4.7.1).
              </p>
            </div>
            <Switch
              checked={showVersionInHeader}
              onCheckedChange={setShowVersionInHeader}
            />
          </div>
        </div>

        <div className="space-y-4 rounded-md border p-4">
          <div>
            <p className="text-sm font-medium">Meeting audio recording</p>
            <p className="text-xs text-muted-foreground">
              Browser in-meeting recordings use these defaults. Uploads are unaffected.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Audio format</Label>
            <Select value={recordingAudioMimeType} onValueChange={setRecordingAudioMimeType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECORDING_FORMAT_PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.mimeType}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="recording-bitrate">Bitrate (kbps)</Label>
            <Input
              id="recording-bitrate"
              type="number"
              min={MIN_RECORDING_BITRATE_KBPS}
              max={MAX_RECORDING_BITRATE_KBPS}
              value={recordingAudioBitrateKbps}
              onChange={(event) =>
                setRecordingAudioBitrateKbps(Number.parseInt(event.target.value, 10) || DEFAULT_RECORDING_BITRATE_KBPS)
              }
            />
            <p className="text-xs text-muted-foreground">
              Default: 96 kbps Opus in WebM. Range: {MIN_RECORDING_BITRATE_KBPS}–
              {MAX_RECORDING_BITRATE_KBPS} kbps. Browsers may fall back if unsupported.
            </p>
          </div>
        </div>

        <Button onClick={onSave} disabled={isPending}>
          {isPending ? "Saving..." : "Save Settings"}
        </Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email (SMTP2go)
        </CardTitle>
        <CardDescription>
          Send a test message to verify transactional email delivery.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status:</span>
          {emailConfigured ? (
            <Badge>Configured</Badge>
          ) : (
            <Badge variant="destructive">Not configured</Badge>
          )}
        </div>
        {!emailConfigured ? (
          <p className="text-sm text-muted-foreground">
            Set <code>SMTP2GO_API_KEY</code> and <code>SMTP2GO_SENDER_EMAIL</code> in the stack
            environment to enable welcome emails, admin alerts, and test sends.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="test-email-to">Send test email to</Label>
              <Input
                id="test-email-to"
                type="email"
                value={testEmailTo}
                onChange={(event) => setTestEmailTo(event.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <Button
              variant="outline"
              className="gap-2"
              disabled={isEmailPending || !testEmailTo.trim()}
              onClick={onSendTestEmail}
            >
              <Mail className="h-4 w-4" />
              {isEmailPending ? "Sending..." : "Send test email"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>

    <BackupRestorePanel emailConfigured={emailConfigured} defaultEmail={defaultTestEmail} />
    </div>
  );
}
