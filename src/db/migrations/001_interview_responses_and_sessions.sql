-- Interview responses persistence, session tracking, backups, transcription audit, report status.
-- Applied automatically via bootstrap-db.ts on startup (idempotent).

CREATE TABLE IF NOT EXISTS interview_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id),
  turn_id UUID NOT NULL,
  question_id VARCHAR(255),
  answer_text TEXT NOT NULL,
  code_content TEXT,
  explanation_text TEXT,
  code_language VARCHAR(50),
  evaluation_data JSONB DEFAULT '{}'::jsonb,
  evaluation_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interview_responses_interview ON interview_responses(interview_id);
CREATE INDEX IF NOT EXISTS idx_interview_responses_turn ON interview_responses(turn_id);
CREATE INDEX IF NOT EXISTS idx_interview_responses_eval_status ON interview_responses(interview_id, evaluation_status);

CREATE TABLE IF NOT EXISTS interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL UNIQUE REFERENCES interviews(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id),
  session_token_hash VARCHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  current_phase VARCHAR(20) NOT NULL DEFAULT 'intro',
  phase_started_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  client_ip VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_candidate ON interview_sessions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_status ON interview_sessions(status);

CREATE TABLE IF NOT EXISTS session_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  state_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_backups_interview ON session_backups(interview_id, created_at DESC);

CREATE TABLE IF NOT EXISTS transcription_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID REFERENCES interviews(id) ON DELETE SET NULL,
  audio_storage_key VARCHAR(512),
  transcript TEXT,
  attempt_number INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  client_ip VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transcription_records_interview ON transcription_records(interview_id);

CREATE TABLE IF NOT EXISTS answer_submission_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  response_id UUID REFERENCES interview_responses(id) ON DELETE SET NULL,
  client_ip VARCHAR(45),
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_code VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_answer_submission_logs_interview ON answer_submission_logs(interview_id, created_at DESC);

CREATE TABLE IF NOT EXISTS report_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  report_status VARCHAR(20) NOT NULL,
  overall_score NUMERIC(5,2),
  change_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_audit_log_interview ON report_audit_log(interview_id, created_at DESC);

ALTER TABLE reports ADD COLUMN IF NOT EXISTS report_status VARCHAR(20) NOT NULL DEFAULT 'draft';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
