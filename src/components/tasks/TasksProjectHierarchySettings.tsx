"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateProjectHierarchySettings } from "@/server/actions/tasks";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_HIERARCHY_RULES,
  type HierarchyRules,
  parseProjectHierarchyRules,
} from "@/lib/tasks/hierarchy";
import type { TaskType } from "./types";

const TASK_TYPES: TaskType[] = ["epic", "feature", "story", "task"];
const PARENT_TYPES: TaskType[] = ["epic", "feature", "story", "task"];

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
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 className="font-medium">Hierarchy rules</h3>
        <p className="text-sm text-muted-foreground">
          Choose which parent ticket types are allowed for each child type.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4 font-medium">Child type</th>
              {PARENT_TYPES.map((parentType) => (
                <th key={parentType} className="px-2 py-2 text-center font-medium capitalize">
                  {parentType}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TASK_TYPES.map((childType) => (
              <tr key={childType} className="border-b last:border-0">
                <td className="py-2 pr-4 capitalize">{childType}</td>
                {PARENT_TYPES.map((parentType) => (
                  <td key={`${childType}-${parentType}`} className="px-2 py-2 text-center">
                    <Checkbox
                      checked={rules[childType].includes(parentType)}
                      onCheckedChange={(checked) =>
                        toggleRule(childType, parentType, checked === true)
                      }
                      aria-label={`${childType} parent ${parentType}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={resetDefaults}>
          Reset defaults
        </Button>
        <Button type="button" onClick={save} disabled={isPending}>
          {isPending ? "Saving…" : "Save hierarchy rules"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Default: Epic has no parent; Feature → Epic; Story → Epic/Feature; Task → Epic/Feature/Story/Task.
      </p>
    </div>
  );
}
