-- Conversation tab groups for forked branches
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS tab_group_id uuid;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS fork_from_message_id uuid REFERENCES ai_messages(id) ON DELETE SET NULL;

UPDATE ai_conversations SET tab_group_id = id WHERE tab_group_id IS NULL;

ALTER TABLE ai_conversations ALTER COLUMN tab_group_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS ai_conversations_tab_group_idx ON ai_conversations(tab_group_id);
