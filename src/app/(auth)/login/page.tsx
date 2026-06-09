"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { loginSchema, type LoginInput } from "@/lib/validators/auth";
import { checkLoginRequirements } from "@/server/actions/auth-login";
import { sendLoginEmailCode } from "@/server/actions/totp";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginStep = "credentials" | "totp" | "email";

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<LoginStep>("credentials");
  const [totpCode, setTotpCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function sendEmailLoginCode() {
    const values = form.getValues();
    setIsLoading(true);
    try {
      const result = await sendLoginEmailCode(values.email, values.password);
      setMaskedEmail(result.maskedEmail);
      toast.success(`Code sent to ${result.maskedEmail}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send code");
    } finally {
      setIsLoading(false);
    }
  }

  async function onSubmitCredentials(values: LoginInput) {
    setIsLoading(true);
    try {
      const check = await checkLoginRequirements(values.email, values.password);
      if (!check.ok) {
        toast.error("Invalid email or password.");
        return;
      }

      if (check.requiresEmail2fa) {
        const result = await sendLoginEmailCode(values.email, values.password);
        setMaskedEmail(result.maskedEmail);
        setStep("email");
        toast.message("Enter the code sent to your email");
        return;
      }

      if (check.requiresTotp) {
        setStep("totp");
        toast.message("Enter your authenticator code");
        return;
      }

      const result = await signIn("credentials", {
        email: values.email,
        password: values.password,
        redirect: false,
      });

      if (result?.error) {
        toast.error("Invalid email or password.");
        return;
      }

      const dest =
        check.isPending || check.requiresSetup ? "/settings" : "/";
      router.replace(dest);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in right now.");
    } finally {
      setIsLoading(false);
    }
  }

  async function onSubmitSecondFactor() {
    const values = form.getValues();
    setIsLoading(true);
    try {
      const result = await signIn("credentials", {
        email: values.email,
        password: values.password,
        totpCode: step === "totp" ? totpCode : undefined,
        backupCode: step === "totp" ? backupCode : undefined,
        emailCode: step === "email" ? emailCode : undefined,
        redirect: false,
      });

      if (result?.error) {
        toast.error(
          step === "email"
            ? "Invalid or expired email code."
            : "Invalid verification or backup code."
        );
        return;
      }

      const check = await checkLoginRequirements(values.email, values.password);
      const dest =
        check.ok && (check.isPending || check.requiresSetup) ? "/settings" : "/";
      router.replace(dest);
      router.refresh();
    } catch {
      toast.error("Unable to sign in right now.");
    } finally {
      setIsLoading(false);
    }
  }

  const stepDescription =
    step === "totp"
      ? "Enter the code from your authenticator app."
      : step === "email"
        ? `Enter the code sent to ${maskedEmail ?? "your email"}.`
        : "Use your internal portal credentials to continue.";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25 }}
      className="w-full max-w-md"
    >
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>{stepDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === "credentials" ? (
            <form onSubmit={form.handleSubmit(onSubmitCredentials)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  disabled={isLoading}
                  {...form.register("email")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  disabled={isLoading}
                  {...form.register("password")}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Checking..." : "Continue"}
              </Button>
            </form>
          ) : step === "totp" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="totp">Authenticator code</Label>
                <Input
                  id="totp"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="123456"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="backup">Backup code (optional)</Label>
                <Input
                  id="backup"
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value)}
                  placeholder="ABCD1234"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep("credentials")}
                >
                  Back
                </Button>
                <Button className="flex-1" disabled={isLoading} onClick={() => void onSubmitSecondFactor()}>
                  {isLoading ? "Signing in..." : "Sign in"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-code">Email verification code</Label>
                <Input
                  id="email-code"
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value)}
                  placeholder="123456"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep("credentials")}
                >
                  Back
                </Button>
                <Button className="flex-1" disabled={isLoading} onClick={() => void onSubmitSecondFactor()}>
                  {isLoading ? "Signing in..." : "Sign in"}
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={isLoading}
                onClick={() => void sendEmailLoginCode()}
              >
                Resend code
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
