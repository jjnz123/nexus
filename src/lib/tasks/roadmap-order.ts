import type { TaskType } from "@/components/tasks/types";

export type RoadmapSortRow = {
  id: string;
  parentId: string | null;
  sortOrder: number;
  number: number | null;
  title: string;
  type: TaskType;
};

/** Depth-first tree order: children immediately follow their parent, siblings by sortOrder. */
export function sortRoadmapRows<T extends RoadmapSortRow>(rows: T[]): T[] {
  const byParent = new Map<string | null, T[]>();

  for (const row of rows) {
    const key = row.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(row);
  }

  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      if (a.number != null && b.number != null) return a.number - b.number;
      return a.title.localeCompare(b.title);
    });
  }

  const result: T[] = [];

  function walk(parentId: string | null) {
    const children = byParent.get(parentId) ?? [];
    for (const child of children) {
      result.push(child);
      walk(child.id);
    }
  }

  walk(null);
  return result;
}

export function hierarchyDepth(
  taskId: string,
  rows: Pick<RoadmapSortRow, "id" | "parentId">[],
  cache = new Map<string, number>()
): number {
  if (cache.has(taskId)) return cache.get(taskId)!;
  const row = rows.find((entry) => entry.id === taskId);
  if (!row?.parentId) {
    cache.set(taskId, 0);
    return 0;
  }
  const depth = hierarchyDepth(row.parentId, rows, cache) + 1;
  cache.set(taskId, depth);
  return depth;
}
