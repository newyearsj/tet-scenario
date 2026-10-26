CREATE TABLE IF NOT EXISTS scenario_batches (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  external_code TEXT NOT NULL,
  source_document_ids UUID[] NOT NULL DEFAULT '{}',
  model_name TEXT,
  is_sample BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, external_code)
);

CREATE TABLE IF NOT EXISTS test_scenarios (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES scenario_batches(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  user_role TEXT NOT NULL,
  user_goal TEXT NOT NULL,
  related_requirement_codes TEXT[] NOT NULL DEFAULT '{}',
  related_screen_ids TEXT[] NOT NULL DEFAULT '{}',
  start_condition TEXT NOT NULL,
  main_flow JSONB NOT NULL DEFAULT '[]'::jsonb,
  branches JSONB NOT NULL DEFAULT '[]'::jsonb,
  end_condition TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('높음', '보통', '낮음', '확인 필요')),
  rationale TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_status TEXT NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft', 'needs_review', 'approved')),
  is_sample BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, code)
);

CREATE INDEX IF NOT EXISTS scenario_batches_project_created_idx ON scenario_batches(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS test_scenarios_project_created_idx ON test_scenarios(project_id, created_at DESC);
