import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { ChatPage } from "@/components/chat/ChatPage";
import { getAiWorkspace, getConversationMessages } from "@/server/actions/ai-chat";
import { getBookmarkPreferences } from "@/server/actions/preferences";

export default async function ChatRoutePage() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "ai:use", session.user.permissions)) {
    redirect("/");
  }

  const [workspace, prefs] = await Promise.all([getAiWorkspace(), getBookmarkPreferences()]);

  let initialMessages: Awaited<ReturnType<typeof getConversationMessages>> = [];
  const conversationId = prefs.activeAiConversationId;

  if (conversationId) {
    try {
      initialMessages = await getConversationMessages(conversationId);
    } catch {
      initialMessages = [];
    }
  }

  return (
    <ChatPage
      initialProjects={workspace.projects}
      initialConversations={workspace.conversations}
      initialMessages={initialMessages}
      initialProjectId={prefs.activeAiProjectId ?? null}
      initialConversationId={conversationId ?? null}
      initialSidebarCollapsed={prefs.chatSidebarCollapsed ?? false}
    />
  );
}
