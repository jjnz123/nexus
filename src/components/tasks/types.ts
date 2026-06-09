export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskType = "epic" | "feature" | "story" | "task";

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
  body: string;
  createdAt: string | Date;
  userName: string;
};

export type TaskDetails = {
  project: ProjectSummary;
  task: Omit<BoardTask, "assigneeName" | "labelIds" | "subtasks" | "parentTitle">;
  comments: TaskComment[];
  subtasks: TaskSubtask[];
  attachments: { id: string; filename: string; path: string; size: number }[];
  labelIds: string[];
};

export type ProjectBoard = {
  project: ProjectSummary;
  columns: TaskColumn[];
  tasks: BoardTask[];
  labels: TaskLabel[];
};
