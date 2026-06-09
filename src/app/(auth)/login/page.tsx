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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"credentials" | "totp">("credentials");
  const [totpCode, setTotpCode] = useState("");
  const [backupCode, setBackupCode] = useState("");

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmitCredentials(values: LoginInput) {
    setIsLoading(true);
    try {
      const check = await checkLoginRequirements(values.email, values.password);
      if (!check.ok) {
        toast.error("Invalid email or password.");
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
    } catch {
      toast.error("Unable to sign in right now.");
    } finally {
      setIsLoading(false);
    }
  }

  async function onSubmitTotp() {
    const values = form.getValues();
    setIsLoading(true);
    try {
      const result = await signIn("credentials", {
        email: values.email,
        password: values.password,
        totpCode,
        backupCode,
        redirect: false,
      });

      if (result?.error) {
        toast.error("Invalid verification or backup code.");
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
          <CardDescription>
            {step === "totp"
              ? "Enter the code from your authenticator app."
              : "Use your internal portal credentials to continue."}
          </CardDescription>
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
          ) : (
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
                <Button className="flex-1" disabled={isLoading} onClick={() => void onSubmitTotp()}>
                  {isLoading ? "Signing in..." : "Sign in"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
