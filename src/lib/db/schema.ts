import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "editor",
  "user",
  "viewer",
]);

export const checkTypeEnum = pgEnum("check_type", ["ping", "tcp", "http"]);

export const monitorStatusEnum = pgEnum("monitor_status", [
  "up",
  "down",
  "unknown",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "task",
  "monitor",
  "system",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  avatarPath: text("avatar_path"),
  role: userRoleEnum("role").notNull().default("user"),
  disabled: boolean("disabled").notNull().default(false),
  permissions: jsonb("permissions")
    .$type<import("@/lib/permissions").UserPermissionOverrides>()
    .default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull().default("system"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("notifications_user_idx").on(table.userId)]
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    userEmail: text("user_email"),
    userName: text("user_name"),
    action: text("action").notNull(),
    resource: text("resource"),
    resourceId: text("resource_id"),
    summary: text("summary").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().default({}),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_created_at_idx").on(table.createdAt),
    index("audit_logs_user_id_idx").on(table.userId),
    index("audit_logs_action_idx").on(table.action),
  ]
);

export const systemSettings = pgTable("system_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  aiModel: text("ai_model").notNull().default("grok-3"),
  portalSubtitle: text("portal_subtitle").default("Internal Operations Portal"),
  portalSubtitleEnabled: boolean("portal_subtitle_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  homeFavouriteOrder: jsonb("home_favourite_order").$type<string[]>().default([]),
  activeBookmarkTabId: uuid("active_bookmark_tab_id"),
  bookmarksLayoutMode: text("bookmarks_layout_mode").notNull().default("grid"),
  bookmarksGlobalLayoutLocked: boolean("bookmarks_global_layout_locked")
    .notNull()
    .default(false),
  bookmarksSortMode: text("bookmarks_sort_mode").notNull().default("custom"),
  activeAiProjectId: uuid("active_ai_project_id"),
  activeAiConversationId: uuid("active_ai_conversation_id"),
  chatSidebarCollapsed: boolean("chat_sidebar_collapsed").notNull().default(false),
  appSidebarCollapsed: boolean("app_sidebar_collapsed").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const bookmarkTabs = pgTable("bookmark_tabs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  layoutLocked: boolean("layout_locked").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bookmarkGroups = pgTable("bookmark_groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  tabId: uuid("tab_id")
    .notNull()
    .references(() => bookmarkTabs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  collapsed: boolean("collapsed").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export type BookmarkIconType = "lucide" | "emoji" | "image" | "text";

export const bookmarkCards = pgTable("bookmark_cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => bookmarkGroups.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url").notNull(),
  icon: text("icon"),
  iconType: text("icon_type").$type<BookmarkIconType>().notNull().default("text"),
  iconValue: text("icon_value"),
  accentColor: text("accent_color").notNull().default("#6366f1"),
  openInIframe: boolean("open_in_iframe").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  favourite: boolean("favourite").notNull().default(false),
  archivedAt: timestamp("archived_at"),
  sortOrder: integer("sort_order").notNull().default(0),
  faviconPath: text("favicon_path"),
  autoTitle: text("auto_title"),
  autoDescription: text("auto_description"),
  tags: jsonb("tags").$type<string[]>().default([]),
  healthMonitoringEnabled: boolean("health_monitoring_enabled").notNull().default(false),
  linkedDeviceId: uuid("linked_device_id").references(() => monitorDevices.id, {
    onDelete: "set null",
  }),
  clickCount: integer("click_count").notNull().default(0),
  lastClickedAt: timestamp("last_clicked_at"),
});

export const userBookmarkFavourites = pgTable(
  "user_bookmark_favourites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: uuid("card_id")
      .notNull()
      .references(() => bookmarkCards.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.cardId] }),
    index("user_bookmark_favourites_user_idx").on(table.userId),
  ]
);

export const bookmarkLaunches = pgTable(
  "bookmark_launches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: uuid("card_id").references(() => bookmarkCards.id, { onDelete: "set null" }),
    source: text("source").notNull(),
    referrer: text("referrer"),
    launchedAt: timestamp("launched_at").defaultNow().notNull(),
  },
  (table) => [
    index("bookmark_launches_user_idx").on(table.userId),
    index("bookmark_launches_card_idx").on(table.cardId),
    index("bookmark_launches_launched_at_idx").on(table.launchedAt),
  ]
);

export const faviconCache = pgTable("favicon_cache", {
  domain: text("domain").primaryKey(),
  faviconPath: text("favicon_path").notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
});

export type AiMessageAttachment = {
  path: string;
  filename: string;
  mimeType: string;
  size: number;
};

export type AiSkillEvent = {
  name: string;
  label: string;
  status: "running" | "success" | "error";
  result?: unknown;
  error?: string;
};

export type AiMessageMetadata = {
  skills?: AiSkillEvent[];
};

export const aiProjects = pgTable(
  "ai_projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("ai_projects_user_idx").on(table.userId)]
);

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => aiProjects.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull().default("New conversation"),
    lastMessagePreview: text("last_message_preview"),
    lastMessageAt: timestamp("last_message_at"),
    enabledSkills: jsonb("enabled_skills").$type<string[] | null>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_conversations_user_idx").on(table.userId),
    index("ai_conversations_project_idx").on(table.projectId),
    index("ai_conversations_last_message_at_idx").on(table.lastMessageAt),
  ]
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    attachments: jsonb("attachments").$type<AiMessageAttachment[]>().default([]),
    metadata: jsonb("metadata").$type<AiMessageMetadata>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_messages_conversation_idx").on(table.conversationId),
    index("ai_messages_created_at_idx").on(table.createdAt),
  ]
);

export const aiProjectFiles = pgTable(
  "ai_project_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => aiProjects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    filename: text("filename").notNull(),
    displayName: text("display_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    textPreview: text("text_preview"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_project_files_project_idx").on(table.projectId),
    index("ai_project_files_user_idx").on(table.userId),
  ]
);

export const aiConversationFiles = pgTable(
  "ai_conversation_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    filename: text("filename").notNull(),
    displayName: text("display_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    textPreview: text("text_preview"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_conversation_files_conversation_idx").on(table.conversationId),
    index("ai_conversation_files_user_idx").on(table.userId),
  ]
);

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const taskColumns = pgTable("task_columns", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  wipLimit: integer("wip_limit"),
  sortOrder: integer("sort_order").notNull().default(0),
  isBacklog: boolean("is_backlog").notNull().default(false),
});

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    columnId: uuid("column_id")
      .notNull()
      .references(() => taskColumns.id, { onDelete: "restrict" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    dueDate: timestamp("due_date"),
    assigneeId: uuid("assignee_id").references(() => users.id),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("tasks_project_idx").on(table.projectId),
    index("tasks_column_idx").on(table.columnId),
  ]
);

export const taskLabels = pgTable("task_labels", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#22c55e"),
});

export const taskLabelMap = pgTable("task_label_map", {
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  labelId: uuid("label_id")
    .notNull()
    .references(() => taskLabels.id, { onDelete: "cascade" }),
});

export const taskSubtasks = pgTable("task_subtasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  completed: boolean("completed").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const taskComments = pgTable("task_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const taskAttachments = pgTable("task_attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  path: text("path").notNull(),
  size: integer("size").notNull(),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const monitorDevices = pgTable("monitor_devices", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  target: text("target").notNull(),
  checkType: checkTypeEnum("check_type").notNull().default("ping"),
  intervalSec: integer("interval_sec").notNull().default(60),
  timeoutMs: integer("timeout_ms").notNull().default(5000),
  enabled: boolean("enabled").notNull().default(true),
  lastStatus: monitorStatusEnum("last_status").default("unknown"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const monitorChecks = pgTable(
  "monitor_checks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => monitorDevices.id, { onDelete: "cascade" }),
    status: monitorStatusEnum("status").notNull(),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    checkedAt: timestamp("checked_at").defaultNow().notNull(),
  },
  (table) => [
    index("monitor_checks_device_idx").on(table.deviceId),
    index("monitor_checks_checked_at_idx").on(table.checkedAt),
  ]
);

export type User = typeof users.$inferSelect;
export type UserRole = User["role"];
export type BookmarkTab = typeof bookmarkTabs.$inferSelect;
export type BookmarkGroup = typeof bookmarkGroups.$inferSelect;
export type BookmarkCard = typeof bookmarkCards.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type TaskColumn = typeof taskColumns.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type MonitorDevice = typeof monitorDevices.$inferSelect;
export type MonitorCheck = typeof monitorChecks.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type SystemSettings = typeof systemSettings.$inferSelect;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type UserBookmarkFavourite = typeof userBookmarkFavourites.$inferSelect;
export type BookmarkLaunch = typeof bookmarkLaunches.$inferSelect;
export type FaviconCache = typeof faviconCache.$inferSelect;
export type AiProject = typeof aiProjects.$inferSelect;
export type AiConversation = typeof aiConversations.$inferSelect;
export type AiMessage = typeof aiMessages.$inferSelect;
export type AiProjectFile = typeof aiProjectFiles.$inferSelect;
export type AiConversationFile = typeof aiConversationFiles.$inferSelect;
