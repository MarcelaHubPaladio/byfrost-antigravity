-- goal_role_rules: add status column
ALTER TABLE goal_role_rules ADD COLUMN status text NOT NULL DEFAULT 'published';

-- Check constraint to ensure only 'draft' or 'published' are allowed
ALTER TABLE goal_role_rules ADD CONSTRAINT goal_role_rules_status_check CHECK (status IN ('draft', 'published'));

COMMENT ON COLUMN goal_role_rules.status IS 'Indicates if the rule is a draft or published to users.';
