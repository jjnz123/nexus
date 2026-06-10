"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateProjectHierarchySettings } from "@/server/actions/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DEFAULT_HIERARCHY_RULES,
  type HierarchyRules,
  parseProjectHierarchyRules,
} from "@/lib/tasks/hierarchy";
import { TASK_TYPES, TASK_TYPE_LABELS } from "@/lib/tasks/task-types";
import type { TaskType } from "./types";

const PARENT_TYPES: TaskType[] = [...TASK_TYPES];

const HIERARCHY_TREE: { type: TaskType; label: string; defaultParents: string }[] = [
  { type: "epic", label: "Epic", defaultParents: "Top level (no parent)" },
  { type: "feature", label: "Feature", defaultParents: "Epic" },
  { type: "story", label: "Story", defaultParents: "Epic, Feature" },
  { type: "task", label: "Task", defaultParents: "Epic, Feature, Story, Task" },
  { type: "bug", label: "Bug", defaultParents: "Epic, Feature, Story, Task (optional)" },
];

export function TasksProjectHierarchySettings({
  projectId,
  settings,
}: {
  projectId: string;
  settings: Record<string, unknown> | null;
}) {
  const [rules, setRules] = useState<HierarchyRules>(() =>
    parseProjectHierarchyRules(settings ?? {})
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setRules(parseProjectHierarchyRules(settings ?? {}));
  }, [settings]);

  function toggleRule(childType: TaskType, parentType: TaskType, checked: boolean) {
    setRules((prev) => {
      const current = new Set(prev[childType]);
      if (checked) current.add(parentType);
      else current.delete(parentType);
      return { ...prev, [childType]: PARENT_TYPES.filter((type) => current.has(type)) };
    });
  }

  function resetDefaults() {
    setRules(DEFAULT_HIERARCHY_RULES);
  }

  function save() {
    startTransition(async () => {
      try {
        await updateProjectHierarchySettings({ projectId, hierarchyRules: rules });
        toast.success("Hierarchy rules saved");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to save hierarchy rules");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/20 p-4">
        <h3 className="font-medium">How hierarchy rules work</h3>
        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">Roadmap:</strong> parent pickers only show allowed
            higher-level types. Children appear directly under their parent in tree order.
          </li>
          <li>
            <strong className="text-foreground">Board:</strong> hierarchy does not hide tickets,
            but parent links and child subtasks respect these rules when creating or linking work.
          </li>
          <li>
            <strong className="text-foreground">Ticket modal:</strong> invalid parent combinations
            are blocked when saving a ticket.
          </li>
        </ul>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <h4 className="font-medium">Default structure</h4>
        <div className="space-y-2 font-mono text-sm">
          {HIERARCHY_TREE.map((node, index) => (
            <div key={node.type} className="flex items-start gap-2">
              <span className="text-muted-foreground">
                {"  ".repeat(index)}
                {index > 0 ? "└─ " : ""}
              </span>
              <div>
                <span className="font-semibold capitalize">{node.label}</span>
                <span className="text-muted-foreground"> — parents: {node.defaultParents}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 rounded-lg border p-4">
        <div>
          <h4 className="font-medium">Allowed parent types</h4>
          <p className="text-sm text-muted-foreground">
            For each child type (row), check which parent types are permitted. Unchecked combinations
            cannot be selected in Roadmap or the ticket editor.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Child ↓ / Parent →</th>
                {PARENT_TYPES.map((parentType) => (
                  <th key={parentType} className="px-2 py-2 text-center font-medium capitalize">
                    {parentType}
                  </th>
                ))}
                <th className="px-2 py-2 font-medium">Effective parents</th>
              </tr>
            </thead>
            <tbody>
              {TASK_TYPES.map((childType) => (
                <tr key={childType} className="border-b last:border-0">
                  <td className="py-2 pr-4">{TASK_TYPE_LABELS[childType]}</td>
                  {PARENT_TYPES.map((parentType) => (
                    <td key={`${childType}-${parentType}`} className="px-2 py-2 text-center">
                      <Checkbox
                        checked={rules[childType].includes(parentType)}
                        onCheckedChange={(checked) =>
                          toggleRule(childType, parentType, checked === true)
                        }
                        aria-label={`${childType} may have parent ${parentType}`}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-2">
                    {rules[childType].length ? (
                      <div className="flex flex-wrap gap-1">
                        {rules[childType].map((type) => (
                          <Badge key={type} variant="secondary" className="capitalize">
                            {type}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={resetDefaults}>
          Reset defaults
        </Button>
        <Button type="button" onClick={save} disabled={isPending}>
          {isPending ? "Saving…" : "Save hierarchy rules"}
        </Button>
      </div>
    </div>
  );
}
