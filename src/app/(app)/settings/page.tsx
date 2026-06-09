import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ProfileSettings } from "@/components/settings/ProfileSettings";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <ProfileSettings
      initialName={session.user.name}
      email={session.user.email}
    />
  );
}
