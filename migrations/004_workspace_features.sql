CREATE TABLE IF NOT EXISTS review_questions (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('policy_missing', 'document_conflict', 'condition_missing', 'reference_error')),
  question TEXT NOT NULL,
  related_requirement_codes TEXT[] NOT NULL DEFAULT '{}',
  related_screen_ids TEXT[] NOT NULL DEFAULT '{}',
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'decided', 'deferred')),
  answer TEXT,
  decision_reason TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS test_case_batches (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  external_code TEXT NOT NULL,
  scenario_ids UUID[] NOT NULL DEFAULT '{}',
  model_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, external_code)
);

CREATE TABLE IF NOT EXISTS test_cases (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES test_case_batches(id) ON DELETE CASCADE,
  scenario_id UUID REFERENCES test_scenarios(id),
  code TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  test_level TEXT NOT NULL CHECK (test_level IN ('기능', '통합', '인수')),
  perspective TEXT NOT NULL CHECK (perspective IN ('정상', '예외', '경계', '권한', '상태 전이', '비기능')),
  priority TEXT NOT NULL,
  priority_reason TEXT NOT NULL,
  related_requirement_codes TEXT[] NOT NULL DEFAULT '{}',
  related_screen_ids TEXT[] NOT NULL DEFAULT '{}',
  preconditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  test_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  question_codes TEXT[] NOT NULL DEFAULT '{}',
  review_status TEXT NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft', 'needs_review', 'reviewed', 'approved', 'excluded', 're_review')),
  execution_status TEXT NOT NULL DEFAULT 'not_run' CHECK (execution_status = 'not_run'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, code, version)
);

CREATE INDEX IF NOT EXISTS review_questions_project_status_idx ON review_questions(project_id, status);
CREATE INDEX IF NOT EXISTS test_cases_project_status_idx ON test_cases(project_id, review_status);
