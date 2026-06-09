import { UserManagement } from "@/components/admin/UserManagement";
import { getUsers } from "@/server/actions/users";

export default async function AdminPage() {
  const users = await getUsers();
  return <UserManagement users={users} />;
}
