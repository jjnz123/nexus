-- Per-user project membership (view / edit)
CREATE TABLE IF NOT EXISTS project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS project_members_user_idx ON project_members(user_id);
CREATE INDEX IF NOT EXISTS project_members_project_idx ON project_members(project_id);

-- Grant existing admins implicit access via role; no backfill for other users (default deny)
