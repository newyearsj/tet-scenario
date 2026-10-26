ALTER TABLE change_proposals
  ADD COLUMN IF NOT EXISTS related_requirement_codes TEXT[] NOT NULL DEFAULT '{}';
