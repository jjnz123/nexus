import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveEnabledSkillNames, getSkillsForUser } from "@/lib/ai/skills/index";
import { hasPermission } from "@/lib/permissions";
import { ChatPage } from "@/components/chat/ChatPage";
import { getAiWorkspace, getConversationMessages } from "@/server/actions/ai-chat";
import { getBookmarkPreferences } from "@/server/actions/preferences";
import { getProjects } from "@/server/actions/tasks";

export default async function ChatRoutePage() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "ai:use", session.user.permissions)) {
    redirect("/");
  }

  const canViewTasks = hasPermission(session.user.role, "tasks:view", session.user.permissions);

  const [workspace, prefs, kanbanProjects] = await Promise.all([
    getAiWorkspace(),
    getBookmarkPreferences(),
    canViewTasks ? getProjects().catch(() => []) : Promise.resolve([]),
  ]);

  let initialMessages: Awaited<ReturnType<typeof getConversationMessages>> = [];
  const conversationId = prefs.activeAiConversationId;
  const activeConversation = conversationId
    ? workspace.conversations.find((c) => c.id === conversationId)
    : null;

  if (conversationId) {
    try {
      initialMessages = await getConversationMessages(conversationId);
    } catch {
      initialMessages = [];
    }
  }

  const skillsForUser = getSkillsForUser(session.user.role, session.user.permissions ?? null);
  const initialEnabledSkills = resolveEnabledSkillNames(
    activeConversation?.enabledSkills,
    skillsForUser
  );

  return (
    <ChatPage
      initialProjects={workspace.projects}
      initialConversations={workspace.conversations}
      initialMessages={initialMessages}
      initialProjectId={prefs.activeAiProjectId ?? null}
      initialConversationId={conversationId ?? null}
      initialSidebarCollapsed={prefs.chatSidebarCollapsed ?? false}
      userRole={session.user.role}
      userPermissions={session.user.permissions ?? null}
      initialEnabledSkills={initialEnabledSkills}
      kanbanProjects={kanbanProjects.map((project) => ({
        id: project.id,
        name: project.name,
      }))}
    />
  );
}
