-- Align AI Chat project references with shared kanban projects (Tasks/Notes)

ALTER TABLE "ai_conversations" DROP CONSTRAINT IF EXISTS "ai_conversations_project_id_ai_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_project_files" DROP CONSTRAINT IF EXISTS "ai_project_files_project_id_ai_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "rag_chunks" DROP CONSTRAINT IF EXISTS "rag_chunks_ai_project_id_ai_projects_id_fk";
--> statement-breakpoint

-- Best-effort remap legacy ai_projects rows to kanban projects by name
UPDATE "ai_conversations" AS c
SET "project_id" = p."id"
FROM "ai_projects" AS ap
INNER JOIN "projects" AS p ON lower(trim(p."name")) = lower(trim(ap."name"))
WHERE c."project_id" = ap."id";
--> statement-breakpoint
UPDATE "ai_conversations"
SET "project_id" = NULL
WHERE "project_id" IS NOT NULL
  AND "project_id" NOT IN (SELECT "id" FROM "projects");
--> statement-breakpoint
UPDATE "ai_project_files" AS f
SET "project_id" = p."id"
FROM "ai_projects" AS ap
INNER JOIN "projects" AS p ON lower(trim(p."name")) = lower(trim(ap."name"))
WHERE f."project_id" = ap."id";
--> statement-breakpoint
DELETE FROM "ai_project_files"
WHERE "project_id" NOT IN (SELECT "id" FROM "projects");
--> statement-breakpoint
UPDATE "rag_chunks" AS rc
SET "ai_project_id" = p."id"
FROM "ai_projects" AS ap
INNER JOIN "projects" AS p ON lower(trim(p."name")) = lower(trim(ap."name"))
WHERE rc."ai_project_id" = ap."id";
--> statement-breakpoint
UPDATE "rag_chunks"
SET "ai_project_id" = NULL
WHERE "ai_project_id" IS NOT NULL
  AND "ai_project_id" NOT IN (SELECT "id" FROM "projects");
--> statement-breakpoint
UPDATE "user_preferences"
SET "active_ai_project_id" = NULL
WHERE "active_ai_project_id" IS NOT NULL
  AND "active_ai_project_id" NOT IN (SELECT "id" FROM "projects");
--> statement-breakpoint

ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "ai_project_files" ADD CONSTRAINT "ai_project_files_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "rag_chunks" ADD CONSTRAINT "rag_chunks_ai_project_id_projects_id_fk"
  FOREIGN KEY ("ai_project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint

DROP TABLE IF EXISTS "ai_projects" CASCADE;
