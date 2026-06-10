import type { TaskType } from "@/components/tasks/types";

/** Allowed parent ticket types for each child type (empty = no parent). */
export type HierarchyRules = Record<TaskType, TaskType[]>;

export const DEFAULT_HIERARCHY_RULES: HierarchyRules = {
  epic: [],
  feature: ["epic"],
  story: ["epic", "feature"],
  task: ["epic", "feature", "story", "task"],
  bug: ["epic", "feature", "story", "task"],
};

const TASK_TYPES: TaskType[] = ["epic", "feature", "story", "task", "bug"];

export function parseProjectHierarchyRules(
  settings: Record<string, unknown> | null | undefined
): HierarchyRules {
  const raw = settings?.hierarchyRules;
  if (!raw || typeof raw !== "object") return DEFAULT_HIERARCHY_RULES;

  const result = { ...DEFAULT_HIERARCHY_RULES };
  for (const type of TASK_TYPES) {
    const saved = (raw as Record<string, unknown>)[type];
    if (!Array.isArray(saved)) continue;
    result[type] = saved.filter(
      (value): value is TaskType =>
        typeof value === "string" && TASK_TYPES.includes(value as TaskType)
    );
  }
  return result;
}

export function getAllowedParentTypes(
  childType: TaskType,
  rules: HierarchyRules = DEFAULT_HIERARCHY_RULES
): TaskType[] {
  return rules[childType] ?? DEFAULT_HIERARCHY_RULES[childType];
}

export function isParentTypeAllowed(
  childType: TaskType,
  parentType: TaskType,
  rules: HierarchyRules = DEFAULT_HIERARCHY_RULES
): boolean {
  return getAllowedParentTypes(childType, rules).includes(parentType);
}

export async function assertValidTaskParent({
  childId,
  childType,
  parentId,
  projectId,
  rules,
  loadParent,
  loadDescendantIds,
}: {
  childId?: string;
  childType: TaskType;
  parentId: string | null | undefined;
  projectId: string;
  rules: HierarchyRules;
  loadParent: (id: string) => Promise<{ id: string; type: TaskType; projectId: string } | null>;
  loadDescendantIds: (id: string) => Promise<string[]>;
}) {
  if (!parentId) {
    if (getAllowedParentTypes(childType, rules).length > 0 && childType !== "epic") {
      // optional parent — allow none
    }
    return;
  }

  if (childId && parentId === childId) {
    throw new Error("A ticket cannot be its own parent");
  }

  const parent = await loadParent(parentId);
  if (!parent) throw new Error("Parent ticket not found");
  if (parent.projectId !== projectId) throw new Error("Parent must be in the same project");

  if (!isParentTypeAllowed(childType, parent.type, rules)) {
    throw new Error(
      `A ${childType} cannot have a parent of type ${parent.type} under current hierarchy rules`
    );
  }

  if (childId) {
    const descendants = await loadDescendantIds(childId);
    if (descendants.includes(parentId)) {
      throw new Error("Parent cannot be a descendant of this ticket");
    }
  }
}
