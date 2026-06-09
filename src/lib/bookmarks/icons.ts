import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bookmark,
  Bot,
  Calendar,
  Cloud,
  Code,
  Database,
  FileText,
  Folder,
  Globe,
  Heart,
  Home,
  Key,
  LayoutDashboard,
  Link2,
  Mail,
  Monitor,
  Search,
  Server,
  Settings,
  Shield,
  Star,
  Terminal,
  Users,
  Wrench,
} from "lucide-react";
import type { BookmarkIconType } from "@/lib/db/schema";

export const LUCIDE_ICON_MAP: Record<string, LucideIcon> = {
  Activity,
  Bookmark,
  Bot,
  Calendar,
  Cloud,
  Code,
  Database,
  FileText,
  Folder,
  Globe,
  Heart,
  Home,
  Key,
  LayoutDashboard,
  Link2,
  Mail,
  Monitor,
  Search,
  Server,
  Settings,
  Shield,
  Star,
  Terminal,
  Users,
  Wrench,
};

export const LUCIDE_ICON_NAMES = Object.keys(LUCIDE_ICON_MAP).sort();

export const ACCENT_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#64748b",
];

export const EMOJI_PRESETS = ["🔗", "📁", "⚙️", "🛠️", "📊", "🔒", "☁️", "💻", "📧", "🌐", "⭐", "🚀"];

export function resolveIconDisplay(card: {
  title: string;
  icon?: string | null;
  iconType?: BookmarkIconType | null;
  iconValue?: string | null;
}) {
  const type = card.iconType ?? "text";
  const value = card.iconValue ?? card.icon ?? "";
  if (type === "lucide" && value && LUCIDE_ICON_MAP[value]) {
    return { type: "lucide" as const, value };
  }
  if (type === "emoji" && value) {
    return { type: "emoji" as const, value };
  }
  if (type === "image" && value) {
    return { type: "image" as const, value };
  }
  return { type: "text" as const, value: value || card.title.slice(0, 2) };
}
