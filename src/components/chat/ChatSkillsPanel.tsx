"use client";

import { Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  getSkillPermission,
  getSkillsForUser,
  resolveEnabledSkillNames,
  type SkillWithAccess,
} from "@/lib/ai/skills/index";
import type { UserPermissionOverrides } from "@/lib/permissions";
import type { UserRole } from "@/lib/db/schema";

function permissionLabel(permission: string) {
  return permission.replace(":", " · ");
}

export function ChatSkillsPanel({
  open,
  onOpenChange,
  userRole,
  userPermissions,
  enabledSkillNames,
  onEnabledChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userRole: UserRole;
  userPermissions: UserPermissionOverrides | null;
  enabledSkillNames: string[];
  onEnabledChange: (names: string[]) => void;
}) {
  const skills = getSkillsForUser(userRole, userPermissions);
  const enabledSet = new Set(enabledSkillNames);

  function toggleSkill(skill: SkillWithAccess, checked: boolean) {
    if (!skill.allowed) return;
    const next = new Set(enabledSkillNames);
    if (checked) next.add(skill.name);
    else next.delete(skill.name);
    onEnabledChange(Array.from(next));
  }

  function enableAllAllowed() {
    onEnabledChange(skills.filter((s) => s.allowed).map((s) => s.name));
  }

  function disableAll() {
    onEnabledChange([]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Skills
          </DialogTitle>
          <DialogDescription>
            Choose which Nexus actions Grok can perform in this conversation. Only enabled skills
            are available to the model.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={enableAllAllowed}>
            Enable all
          </Button>
          <Button size="sm" variant="ghost" onClick={disableAll}>
            Disable all
          </Button>
        </div>

        <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
          {skills.map((skill) => (
            <div
              key={skill.name}
              className="flex items-start justify-between gap-3 rounded-xl border p-3"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor={`skill-${skill.name}`} className="font-medium">
                    {skill.label}
                  </Label>
                  <Badge variant="outline" className="text-[10px]">
                    {permissionLabel(getSkillPermission(skill.name))}
                  </Badge>
                  {!skill.allowed ? (
                    <Badge variant="secondary" className="text-[10px]">
                      No permission
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{skill.description}</p>
              </div>
              <Switch
                id={`skill-${skill.name}`}
                checked={enabledSet.has(skill.name)}
                disabled={!skill.allowed}
                onCheckedChange={(checked) => toggleSkill(skill, checked)}
              />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ChatActiveSkillChips({
  userRole,
  userPermissions,
  enabledSkillNames,
  onOpenSkills,
}: {
  userRole: UserRole;
  userPermissions: UserPermissionOverrides | null;
  enabledSkillNames: string[];
  onOpenSkills: () => void;
}) {
  const skills = getSkillsForUser(userRole, userPermissions);
  const active = skills.filter((s) => s.allowed && enabledSkillNames.includes(s.name));

  if (active.length === 0) {
    return (
      <button
        type="button"
        onClick={onOpenSkills}
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        No skills enabled · Configure
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {active.map((skill) => (
        <Badge
          key={skill.name}
          variant="secondary"
          className="cursor-pointer gap-1 px-2 py-0.5 text-[10px] font-normal"
          onClick={onOpenSkills}
        >
          <Wrench className="h-3 w-3" />
          {skill.label}
        </Badge>
      ))}
      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={onOpenSkills}>
        Edit
      </Button>
    </div>
  );
}

export function resolveInitialEnabledSkills(
  stored: string[] | null | undefined,
  userRole: UserRole,
  userPermissions: UserPermissionOverrides | null
) {
  const available = getSkillsForUser(userRole, userPermissions);
  return resolveEnabledSkillNames(stored, available);
}
