ALTER TABLE test_cases
  ADD COLUMN IF NOT EXISTS user_role TEXT,
  ADD COLUMN IF NOT EXISTS creation_source TEXT NOT NULL DEFAULT 'openai_actual'
    CHECK (creation_source IN ('openai_actual','fixture_sample','user_direct','change_regeneration')),
  ADD COLUMN IF NOT EXISTS last_modified_source TEXT NOT NULL DEFAULT 'openai_actual'
    CHECK (last_modified_source IN ('openai_actual','fixture_sample','user_direct','user_edit','change_regeneration')),
  ADD COLUMN IF NOT EXISTS modification_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_user_authored BOOLEAN NOT NULL DEFAULT false;

UPDATE test_cases tc SET
  user_role = ts.user_role,
  creation_source = CASE WHEN ts.is_sample THEN 'fixture_sample' ELSE 'openai_actual' END,
  last_modified_source = CASE WHEN ts.is_sample THEN 'fixture_sample' ELSE 'openai_actual' END
FROM test_scenarios ts
WHERE tc.scenario_id = ts.id AND tc.user_role IS NULL;

CREATE TABLE IF NOT EXISTS test_case_versions (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  modification_reason TEXT NOT NULL,
  modified_source TEXT NOT NULL,
  actor_user_id UUID REFERENCES app_users(id),
  actor_label TEXT,
  replaced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (test_case_id, version)
);

ALTER TABLE test_case_batches
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('processing','completed','partial_failed','failed')),
  ADD COLUMN IF NOT EXISTS generation_key TEXT,
  ADD COLUMN IF NOT EXISTS completed_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS test_case_batches_generation_key_idx
  ON test_case_batches(project_id, generation_key) WHERE generation_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS test_case_batch_results (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES test_case_batches(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL REFERENCES test_scenarios(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('processing','completed','failed')),
  generated_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, scenario_id)
);

ALTER TABLE change_logs
  ADD COLUMN IF NOT EXISTS target_code TEXT,
  ADD COLUMN IF NOT EXISTS target_version INTEGER,
  ADD COLUMN IF NOT EXISTS change_source TEXT,
  ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS actor_label TEXT,
  ADD COLUMN IF NOT EXISTS reason TEXT;

CREATE INDEX IF NOT EXISTS test_case_versions_case_idx ON test_case_versions(test_case_id, version DESC);
CREATE INDEX IF NOT EXISTS change_logs_filter_idx ON change_logs(project_id, target_type, action, created_at DESC);

