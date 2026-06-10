import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { getSystemSettings, getRecordingSettings } from "@/server/settings";
import { getBookmarkPreferences } from "@/server/actions/preferences";
import { syncThemeCookie } from "@/lib/theme-server";
import { normalizeColorTheme } from "@/lib/theme";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [settings, prefs, recordingSettings] = await Promise.all([
    getSystemSettings(),
    getBookmarkPreferences(),
    getRecordingSettings(),
  ]);
  await syncThemeCookie(normalizeColorTheme(prefs.colorTheme));

  return (
    <AppShell
      user={{
        ...session.user,
        permissions: session.user.permissions ?? null,
      }}
      portalSubtitle={settings.portalSubtitle ?? "Internal Operations Portal"}
      portalSubtitleEnabled={settings.portalSubtitleEnabled}
      initialAppSidebarCollapsed={prefs.appSidebarCollapsed ?? false}
      recordingSettings={recordingSettings}
    >
      {children}
    </AppShell>
  );
}
