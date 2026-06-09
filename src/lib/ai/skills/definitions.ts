export type SkillDefinition = {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
};

export const NEXUS_SKILLS: SkillDefinition[] = [
  {
    name: "create_task",
    label: "Create Task",
    description:
      "Create a new task on a kanban project. Use the project key (e.g. OPS) and optional column name.",
    parameters: {
      type: "object",
      properties: {
        projectKey: {
          type: "string",
          description: "Kanban project key, e.g. OPS",
        },
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Optional task description" },
        priority: {
          type: "string",
          enum: ["low", "medium", "high", "urgent"],
        },
        columnName: {
          type: "string",
          description: 'Target column name, default "To Do"',
        },
      },
      required: ["projectKey", "title"],
    },
  },
  {
    name: "update_task",
    label: "Update Task",
    description: "Update an existing task by its key, e.g. OPS-12.",
    parameters: {
      type: "object",
      properties: {
        taskKey: { type: "string", description: "Task key like OPS-12" },
        title: { type: "string" },
        description: { type: "string" },
        priority: {
          type: "string",
          enum: ["low", "medium", "high", "urgent"],
        },
        columnName: { type: "string", description: "Move task to this column" },
      },
      required: ["taskKey"],
    },
  },
  {
    name: "check_monitor_status",
    label: "Check Monitoring",
    description:
      "Get monitoring overview or look up a specific device/host by name or target.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional device name or target to search. Omit for overall stats.",
        },
      },
    },
  },
  {
    name: "search_bookmarks",
    label: "Search Bookmarks",
    description: "Search bookmark cards by title, description, URL, or tags.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text" },
        limit: { type: "number", description: "Max results, default 10" },
      },
      required: ["query"],
    },
  },
  {
    name: "web_search",
    label: "Web Search",
    description:
      "Search the public web for up-to-date information. Use when the user asks about current events, documentation, or facts outside Nexus.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        maxResults: { type: "number", description: "Max citations to return, default 8" },
      },
      required: ["query"],
    },
  },
  {
    name: "x_search",
    label: "X Search",
    description:
      "Search X (Twitter) for recent posts and discussions. Use for social sentiment, announcements, or trending topics on X.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        maxResults: { type: "number", description: "Max citations to return, default 8" },
      },
      required: ["query"],
    },
  },
];

export function skillDefinitionsForApi() {
  return NEXUS_SKILLS.map((skill) => ({
    type: "function" as const,
    function: {
      name: skill.name,
      description: skill.description,
      parameters: skill.parameters,
    },
  }));
}

export function getSkillLabel(name: string) {
  return NEXUS_SKILLS.find((skill) => skill.name === name)?.label ?? name;
}
