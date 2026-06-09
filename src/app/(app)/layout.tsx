import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { getSystemSettings } from "@/server/settings";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const settings = await getSystemSettings();

  return (
    <AppShell
      user={{
        ...session.user,
        permissions: session.user.permissions ?? null,
      }}
      portalSubtitle={settings.portalSubtitle ?? "Internal Operations Portal"}
      portalSubtitleEnabled={settings.portalSubtitleEnabled}
    >
      {children}
    </AppShell>
  );
}
