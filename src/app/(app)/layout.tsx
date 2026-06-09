import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { getSystemSettings } from "@/server/settings";
import { getBookmarkPreferences } from "@/server/actions/preferences";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [settings, prefs] = await Promise.all([getSystemSettings(), getBookmarkPreferences()]);

  return (
    <AppShell
      user={{
        ...session.user,
        permissions: session.user.permissions ?? null,
      }}
      portalSubtitle={settings.portalSubtitle ?? "Internal Operations Portal"}
      portalSubtitleEnabled={settings.portalSubtitleEnabled}
      initialAppSidebarCollapsed={prefs.appSidebarCollapsed ?? false}
    >
      {children}
    </AppShell>
  );
}
