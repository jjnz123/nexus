"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  beginTotpSetup,
  confirmTotpSetup,
  disableTotp,
  getTwoFactorStatus,
} from "@/server/actions/totp";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function TwoFactorSettings({
  initialRequired,
  initialEnabled,
  email2faEnabled = false,
}: {
  initialRequired: boolean;
  initialEnabled: boolean;
  email2faEnabled?: boolean;
}) {
  const [required] = useState(initialRequired);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [isPending, startTransition] = useTransition();

  const startSetup = () => {
    startTransition(async () => {
      try {
        const result = await beginTotpSetup();
        setQrDataUrl(result.qrDataUrl);
        setManualKey(result.manualKey);
        toast.message("Scan the QR code with your authenticator app");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to start 2FA setup");
      }
    });
  };

  const confirmSetup = () => {
    startTransition(async () => {
      try {
        const result = await confirmTotpSetup({ code: verifyCode });
        setBackupCodes(result.backupCodes);
        setEnabled(true);
        setQrDataUrl(null);
        setVerifyCode("");
        toast.success("Two-factor authentication enabled");
        await getTwoFactorStatus();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Invalid code");
      }
    });
  };

  const onDisable = () => {
    startTransition(async () => {
      try {
        await disableTotp({ currentPassword: disablePassword, code: disableCode });
        setEnabled(false);
        setDisablePassword("");
        setDisableCode("");
        toast.success("Two-factor authentication disabled");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to disable 2FA");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Two-Factor Authentication
          {enabled ? (
            <Badge>Enabled</Badge>
          ) : required ? (
            <Badge variant="destructive">Required</Badge>
          ) : (
            <Badge variant="secondary">Optional</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {required
            ? "Use an authenticator app (TOTP). Required for all non-administrator accounts."
            : "Optional for administrator accounts. When enabled, you'll need your authenticator code at sign-in."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {backupCodes ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="text-sm font-medium">Save these backup codes</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Each code works once if you lose access to your authenticator.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
              {backupCodes.map((code) => (
                <span key={code}>{code}</span>
              ))}
            </div>
          </div>
        ) : null}

        {!enabled && !qrDataUrl && !email2faEnabled ? (
          <Button onClick={startSetup} disabled={isPending}>
            Set up authenticator
          </Button>
        ) : null}

        {!enabled && email2faEnabled ? (
          <p className="text-sm text-muted-foreground">
            Email 2FA is enabled. Disable it first to switch to an authenticator app.
          </p>
        ) : null}

        {qrDataUrl ? (
          <div className="space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="2FA QR code" className="mx-auto h-48 w-48 rounded-lg border bg-white p-2" />
            {manualKey ? (
              <p className="text-center font-mono text-xs text-muted-foreground">{manualKey}</p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="totp-verify">Verification code</Label>
              <Input
                id="totp-verify"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                placeholder="123456"
                inputMode="numeric"
              />
            </div>
            <Button onClick={confirmSetup} disabled={isPending || verifyCode.length < 6}>
              Confirm and enable
            </Button>
          </div>
        ) : null}

        {enabled && !required ? (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">Disable 2FA (admin accounts only)</p>
            <Input
              type="password"
              placeholder="Current password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
            />
            <Input
              placeholder="Authenticator code"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
            />
            <Button variant="destructive" onClick={onDisable} disabled={isPending}>
              Disable 2FA
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
