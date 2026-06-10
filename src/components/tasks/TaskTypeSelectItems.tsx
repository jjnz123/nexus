import { SelectItem } from "@/components/ui/select";
import { TASK_TYPES, TASK_TYPE_LABELS } from "@/lib/tasks/task-types";

export function TaskTypeSelectItems() {
  return TASK_TYPES.map((type) => (
    <SelectItem key={type} value={type}>
      {TASK_TYPE_LABELS[type]}
    </SelectItem>
  ));
}
