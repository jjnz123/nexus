import { NEXUS_SKILLS, type SkillDefinition } from "./definitions";
import {
  hasPermission,
  type Permission,
  type UserPermissionOverrides,
} from "@/lib/permissions";
import type { UserRole } from "@/lib/db/schema";

export type SkillWithAccess = SkillDefinition & {
  permission: Permission;
  allowed: boolean;
};

const SKILL_PERMISSIONS: Record<string, Permission> = {
  create_task: "tasks:edit",
  update_task: "tasks:edit",
  check_monitor_status: "monitoring:view",
  search_bookmarks: "bookmarks:view",
  web_search: "ai:use",
  x_search: "ai:use",
};

export function getSkillPermission(name: string): Permission {
  return SKILL_PERMISSIONS[name] ?? "ai:use";
}

export function getSkillsForUser(
  role: UserRole,
  permissions: UserPermissionOverrides | null
): SkillWithAccess[] {
  return NEXUS_SKILLS.map((skill) => {
    const permission = getSkillPermission(skill.name);
    return {
      ...skill,
      permission,
      allowed: hasPermission(role, permission, permissions),
    };
  });
}

export function resolveEnabledSkillNames(
  enabledSkills: string[] | null | undefined,
  available: SkillWithAccess[]
): string[] {
  const allowedNames = available.filter((s) => s.allowed).map((s) => s.name);
  if (enabledSkills === null || enabledSkills === undefined) return allowedNames;
  if (enabledSkills.length === 0) return [];
  return enabledSkills.filter((name) => allowedNames.includes(name));
}

export function skillDefinitionsForApi(enabledNames?: string[]) {
  const defs = NEXUS_SKILLS.map((skill) => ({
    type: "function" as const,
    function: {
      name: skill.name,
      description: skill.description,
      parameters: skill.parameters,
    },
  }));

  if (enabledNames === undefined) return defs;
  if (enabledNames.length === 0) return [];
  const set = new Set(enabledNames);
  return defs.filter((d) => set.has(d.function.name));
}

export { getSkillLabel } from "./definitions";
