import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminUser, isPendingUser, mustSetupTwoFactor } from "@/lib/auth/user-access";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { TwoFactorSettings } from "@/components/settings/TwoFactorSettings";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const ctx = {
    role: session.user.role,
    status: session.user.status,
    totpEnabled: session.user.totpEnabled,
    permissions: session.user.permissions,
  };

  return (
    <div className="space-y-6">
      {isPendingUser(ctx) ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          Your account is <strong>pending</strong>. An administrator must elevate you to member or
          administrator before you can access the rest of Nexus.
        </div>
      ) : null}
      {mustSetupTwoFactor(ctx) ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          Two-factor authentication is required. Set up your authenticator below to unlock the
          portal.
        </div>
      ) : null}
      <ProfileSettings initialName={session.user.name} email={session.user.email} />
      <TwoFactorSettings
        initialRequired={!isAdminUser(ctx)}
        initialEnabled={session.user.totpEnabled}
      />
    </div>
  );
}
