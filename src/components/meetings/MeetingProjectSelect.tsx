"use client";

import { useState, useTransition } from "react";
import { PlusCircle } from "lucide-react";
import { toast } from "sonner";
import type { Project } from "@/lib/db/schema";
import { createProject } from "@/server/actions/tasks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function MeetingProjectSelect({
  projects,
  value,
  onChange,
  onProjectsChange,
  canCreateProject = false,
  disabled = false,
}: {
  projects: Project[];
  value: string;
  onChange: (projectId: string) => void;
  onProjectsChange?: (projects: Project[]) => void;
  canCreateProject?: boolean;
  disabled?: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [isPending, startTransition] = useTransition();

  const createNewProject = () => {
    if (!newKey.trim() || !newName.trim()) {
      toast.error("Project key and name are required");
      return;
    }
    startTransition(async () => {
      try {
        const project = await createProject({
          key: newKey.trim().toUpperCase(),
          name: newName.trim(),
        });
        const next = [...projects, project].sort((a, b) => a.name.localeCompare(b.name));
        onProjectsChange?.(next);
        onChange(project.id);
        setNewKey("");
        setNewName("");
        setDialogOpen(false);
        toast.success(`Project ${project.key} created`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to create project");
      }
    });
  };

  return (
    <>
      <div className="flex gap-2">
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger className="min-w-[200px] flex-1">
            <SelectValue placeholder="Select project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No project</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} ({p.key})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canCreateProject ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="Create project"
            disabled={disabled}
            onClick={() => setDialogOpen(true)}
          >
            <PlusCircle className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>
              Add a new Tasks project and link it to this meeting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="meeting-project-key">Key</Label>
              <Input
                id="meeting-project-key"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value.toUpperCase())}
                placeholder="OPS"
                maxLength={10}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meeting-project-name">Name</Label>
              <Input
                id="meeting-project-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Operations"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={createNewProject} disabled={isPending}>
                {isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
