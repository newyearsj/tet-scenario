CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY,
  auth_provider TEXT,
  provider_subject TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (auth_provider, provider_subject)
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  name TEXT,
  owner_user_id UUID REFERENCES app_users(id),
  is_sample BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_extension TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes >= 0),
  document_version INTEGER NOT NULL DEFAULT 1 CHECK (document_version > 0),
  original_text TEXT NOT NULL,
  analysis_text TEXT NOT NULL,
  original_character_count INTEGER NOT NULL CHECK (original_character_count >= 0),
  analyzed_character_count INTEGER NOT NULL CHECK (analyzed_character_count >= 0),
  unanalyzed_character_count INTEGER NOT NULL CHECK (unanalyzed_character_count >= 0),
  parse_status TEXT NOT NULL CHECK (parse_status IN ('parsed', 'over_limit', 'empty', 'failed')),
  parse_error_code TEXT,
  source_map JSONB NOT NULL DEFAULT '[]'::jsonb,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_project_uploaded_idx ON documents(project_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS requirements (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'draft', 'deleted')),
  source_document_id UUID REFERENCES documents(id),
  source_document_name TEXT,
  is_sample BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS requirement_versions (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  source_document_id UUID REFERENCES documents(id),
  source_document_name TEXT,
  replaced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (requirement_id, version)
);

CREATE TABLE IF NOT EXISTS requirement_trace_links (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('scenario', 'test_case')),
  target_code TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'unchanged',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (requirement_id, target_type, target_code)
);

CREATE TABLE IF NOT EXISTS change_sets (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  external_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewing', 'applied', 'failed')),
  apply_scope TEXT CHECK (apply_scope IN ('requirements', 'scenarios', 'testCases')),
  is_sample BOOLEAN NOT NULL DEFAULT false,
  source_document_ids UUID[] NOT NULL DEFAULT '{}',
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, external_code)
);

CREATE TABLE IF NOT EXISTS change_proposals (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  change_set_id UUID NOT NULL REFERENCES change_sets(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('add', 'update', 'delete')),
  requirement_code TEXT NOT NULL,
  title TEXT NOT NULL,
  before_content TEXT,
  after_content TEXT,
  reason TEXT NOT NULL,
  source JSONB NOT NULL,
  impact JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (change_set_id, external_id)
);

CREATE TABLE IF NOT EXISTS change_logs (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  change_set_id UUID REFERENCES change_sets(id),
  target_type TEXT NOT NULL,
  target_id UUID,
  action TEXT NOT NULL,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS change_sets_project_created_idx ON change_sets(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS requirements_project_status_idx ON requirements(project_id, status);
CREATE INDEX IF NOT EXISTS change_logs_project_created_idx ON change_logs(project_id, created_at DESC);
