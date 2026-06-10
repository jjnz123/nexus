export type TaskPriority = "low" | "medium" | "high" | "urgent";
import type { TaskType } from "@/lib/tasks/task-types";
export type { TaskType };
export type TaskLinkType = "relates_to" | "blocks" | "duplicates";

export type ProjectSummary = {
  id: string;
  key: string;
  name: string;
  settings: Record<string, unknown> | null;
  createdAt: string | Date;
};

export type TaskColumn = {
  id: string;
  projectId: string;
  name: string;
  color: string;
  wipLimit: number | null;
  sortOrder: number;
  isBacklog: boolean;
};

export type TaskLabel = {
  id: string;
  projectId: string;
  name: string;
  color: string;
};

export type TaskSubtask = {
  id: string;
  taskId: string;
  title: string;
  completed: boolean;
  sortOrder: number;
};

export type BoardTask = {
  id: string;
  projectId: string;
  columnId: string;
  number: number;
  title: string;
  description: string | null;
  details: string | null;
  acceptanceCriteria: string | null;
  definitionOfDone: string | null;
  storyPoints: number | null;
  priority: TaskPriority;
  dueDate: string | Date | null;
  assigneeId: string | null;
  type: TaskType;
  parentId: string | null;
  parentTitle: string | null;
  sortOrder: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  assigneeName: string | null;
  labelIds: string[];
  subtasks: TaskSubtask[];
};

export type TaskComment = {
  id: string;
  taskId: string;
  userId: string;
  parentId: string | null;
  body: string;
  createdAt: string | Date;
  userName: string;
};

export type TaskAttachmentKind = "file" | "url" | "email";

export type TaskAttachment = {
  id: string;
  kind: TaskAttachmentKind;
  filename: string;
  displayTitle: string | null;
  path: string | null;
  url: string | null;
  mimeType: string;
  size: number;
  version: number;
  groupId: string | null;
  isCurrent: boolean;
  emailSubject: string | null;
  emailFrom: string | null;
  emailSentAt: string | Date | null;
  uploadedByName: string | null;
  createdAt: string | Date;
};

export type TaskChild = {
  id: string;
  key: string;
  title: string;
  type: TaskType;
  columnId: string;
  assigneeName: string | null;
};

export type TaskLink = {
  id: string;
  linkType: TaskLinkType;
  linkedTaskId: string;
  linkedTaskKey: string;
  linkedTaskTitle: string;
  direction: "outgoing" | "incoming";
};

export type TaskDetails = {
  project: ProjectSummary;
  task: Omit<BoardTask, "assigneeName" | "labelIds" | "subtasks" | "parentTitle">;
  comments: TaskComment[];
  subtasks: TaskSubtask[];
  attachments: TaskAttachment[];
  childTasks: TaskChild[];
  links: TaskLink[];
  labelIds: string[];
};

export type ProjectBoard = {
  project: ProjectSummary;
  columns: TaskColumn[];
  tasks: BoardTask[];
  labels: TaskLabel[];
};

export type RoadmapDraftCreate = {
  draftId: string;
  title: string;
  type: TaskType;
  parentId: string | null;
  assigneeId: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  storyPoints: number | null;
  columnId: string;
  sortOrder: number;
  description?: string | null;
};

export type RoadmapDraftUpdate = {
  id: string;
  title?: string;
  type?: TaskType;
  parentId?: string | null;
  assigneeId?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  storyPoints?: number | null;
  columnId?: string;
  sortOrder?: number;
  description?: string | null;
  details?: string | null;
  acceptanceCriteria?: string | null;
  definitionOfDone?: string | null;
};
