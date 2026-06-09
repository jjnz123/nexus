"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import {
  confirmEmail2faSetup,
  disableEmail2fa,
  sendEmail2faDisableCode,
  sendEmail2faSetupCode,
} from "@/server/actions/totp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EmailTwoFactorSettings({
  initialEnabled,
  initialRequired,
  emailConfigured,
  totpEnabled,
}: {
  initialEnabled: boolean;
  initialRequired: boolean;
  emailConfigured: boolean;
  totpEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [setupPassword, setSetupPassword] = useState("");
  const [setupCodeSent, setSetupCodeSent] = useState(false);
  const [setupMaskedEmail, setSetupMaskedEmail] = useState<string | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCodeSent, setDisableCodeSent] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [isPending, startTransition] = useTransition();

  const sendSetupCode = () => {
    startTransition(async () => {
      try {
        const result = await sendEmail2faSetupCode({ currentPassword: setupPassword });
        setSetupCodeSent(true);
        setSetupMaskedEmail(result.maskedEmail);
        toast.success(`Verification code sent to ${result.maskedEmail}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to send code");
      }
    });
  };

  const confirmSetup = () => {
    startTransition(async () => {
      try {
        await confirmEmail2faSetup({ code: setupCode });
        setEnabled(true);
        setSetupPassword("");
        setSetupCode("");
        setSetupCodeSent(false);
        toast.success("Email two-factor authentication enabled");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Invalid code");
      }
    });
  };

  const sendDisableCode = () => {
    startTransition(async () => {
      try {
        const result = await sendEmail2faDisableCode({ currentPassword: disablePassword });
        setDisableCodeSent(true);
        toast.success(`Verification code sent to ${result.maskedEmail}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to send code");
      }
    });
  };

  const onDisable = () => {
    startTransition(async () => {
      try {
        await disableEmail2fa({ currentPassword: disablePassword, code: disableCode });
        setEnabled(false);
        setDisablePassword("");
        setDisableCode("");
        setDisableCodeSent(false);
        toast.success("Email two-factor authentication disabled");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to disable email 2FA");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Two-Factor Authentication
          {enabled ? (
            <Badge>Enabled</Badge>
          ) : initialRequired ? (
            <Badge variant="destructive">Required</Badge>
          ) : (
            <Badge variant="secondary">Optional</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Receive a one-time code by email when signing in. Requires SMTP2go to be configured.
          {initialRequired
            ? " Non-administrators must enable either email codes or an authenticator app."
            : " Optional for administrators; enforced at sign-in when enabled."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!emailConfigured ? (
          <p className="text-sm text-muted-foreground">
            Email delivery is not configured. Ask an administrator to set{" "}
            <code>SMTP2GO_API_KEY</code> and <code>SMTP2GO_SENDER_EMAIL</code>, or use an
            authenticator app instead.
          </p>
        ) : null}

        {!enabled && emailConfigured && !totpEnabled ? (
          <div className="space-y-3">
            {!setupCodeSent ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email-2fa-password">Current password</Label>
                  <Input
                    id="email-2fa-password"
                    type="password"
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                  />
                </div>
                <Button onClick={sendSetupCode} disabled={isPending || !setupPassword}>
                  Send verification code
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Enter the code sent to {setupMaskedEmail ?? "your email"}.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="email-2fa-setup-code">Verification code</Label>
                  <Input
                    id="email-2fa-setup-code"
                    value={setupCode}
                    onChange={(e) => setSetupCode(e.target.value)}
                    placeholder="123456"
                    inputMode="numeric"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={confirmSetup} disabled={isPending || setupCode.length < 6}>
                    Enable email 2FA
                  </Button>
                  <Button
                    variant="outline"
                    onClick={sendSetupCode}
                    disabled={isPending || !setupPassword}
                  >
                    Resend code
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {!enabled && totpEnabled ? (
          <p className="text-sm text-muted-foreground">
            Authenticator 2FA is enabled. Disable it first to switch to email codes.
          </p>
        ) : null}

        {enabled && !initialRequired ? (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">Disable email 2FA</p>
            <Input
              type="password"
              placeholder="Current password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
            />
            {!disableCodeSent ? (
              <Button
                variant="outline"
                onClick={sendDisableCode}
                disabled={isPending || !disablePassword}
              >
                Send disable code
              </Button>
            ) : (
              <>
                <Input
                  placeholder="Email verification code"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  inputMode="numeric"
                />
                <Button variant="destructive" onClick={onDisable} disabled={isPending}>
                  Disable email 2FA
                </Button>
              </>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
