-- ============================================================
-- Migration 001: Initial Schema
-- Debugging Contest Platform
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- contestants
-- ============================================================
CREATE TABLE IF NOT EXISTS contestants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_number VARCHAR(50) UNIQUE NOT NULL,
  name            VARCHAR(200) NOT NULL,
  department      VARCHAR(200) NOT NULL DEFAULT 'Artificial Intelligence and Data Science',
  password_hash   TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contestants_reg_no ON contestants(registration_number);

-- ============================================================
-- admins
-- ============================================================
CREATE TABLE IF NOT EXISTS admins (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username        VARCHAR(100) UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- contests
-- ============================================================
CREATE TABLE IF NOT EXISTS contests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           VARCHAR(200) NOT NULL,
  description     TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  max_violations  INTEGER NOT NULL DEFAULT 3,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  show_score_to_contestant BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- questions
-- ============================================================
CREATE TABLE IF NOT EXISTS questions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contest_id      UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  question_number INTEGER NOT NULL,
  language        VARCHAR(20) NOT NULL CHECK (language IN ('C', 'JAVA', 'PYTHON')),
  title           VARCHAR(300) NOT NULL,
  description     TEXT NOT NULL,
  starter_code    TEXT NOT NULL,
  difficulty      VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  points          INTEGER NOT NULL DEFAULT 10,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contest_id, question_number, language)
);

CREATE INDEX IF NOT EXISTS idx_questions_contest_lang ON questions(contest_id, language);

-- ============================================================
-- test_cases
-- ============================================================
CREATE TABLE IF NOT EXISTS test_cases (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id     UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  input_data      TEXT NOT NULL DEFAULT '',
  expected_output TEXT NOT NULL,
  is_hidden       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_cases_question ON test_cases(question_id);

-- ============================================================
-- attempts
-- ============================================================
CREATE TABLE IF NOT EXISTS attempts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contest_id      UUID NOT NULL REFERENCES contests(id),
  contestant_id   UUID NOT NULL REFERENCES contestants(id),
  language        VARCHAR(20) CHECK (language IN ('C', 'JAVA', 'PYTHON')),
  status          VARCHAR(30) NOT NULL DEFAULT 'NOT_STARTED'
                  CHECK (status IN ('NOT_STARTED', 'LANGUAGE_SELECTED', 'IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED')),
  started_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  submitted_at    TIMESTAMPTZ,
  score           INTEGER,
  violation_count INTEGER NOT NULL DEFAULT 0,
  auto_submit_reason VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contest_id, contestant_id)
);

CREATE INDEX IF NOT EXISTS idx_attempts_contestant ON attempts(contestant_id);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON attempts(status);

-- ============================================================
-- answers
-- ============================================================
CREATE TABLE IF NOT EXISTS answers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id      UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES questions(id),
  code            TEXT NOT NULL DEFAULT '',
  status          VARCHAR(30) NOT NULL DEFAULT 'NOT_VISITED'
                  CHECK (status IN ('NOT_VISITED', 'VISITED', 'SAVED', 'CHECKED', 'SUBMITTED')),
  last_saved_at   TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  evaluation_result JSONB,
  points_earned   INTEGER,
  assigned_order  INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_answers_attempt ON answers(attempt_id);

-- ============================================================
-- violations
-- ============================================================
CREATE TABLE IF NOT EXISTS violations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id      UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  type            VARCHAR(50) NOT NULL,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  question_id     UUID REFERENCES questions(id),
  metadata        JSONB
);

CREATE INDEX IF NOT EXISTS idx_violations_attempt ON violations(attempt_id);

-- ============================================================
-- contest_events
-- ============================================================
CREATE TABLE IF NOT EXISTS contest_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id      UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  event_type      VARCHAR(60) NOT NULL,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata        JSONB
);

CREATE INDEX IF NOT EXISTS idx_events_attempt ON contest_events(attempt_id);

-- ============================================================
-- evaluation_runs
-- ============================================================
CREATE TABLE IF NOT EXISTS evaluation_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id      UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES questions(id),
  submitted_code  TEXT NOT NULL,
  language        VARCHAR(20) NOT NULL,
  status          VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'RUNNING', 'ACCEPTED', 'WRONG_ANSWER', 'COMPILE_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED', 'FAILED')),
  score           INTEGER DEFAULT 0,
  judge_response  JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_eval_runs_attempt ON evaluation_runs(attempt_id, question_id);

-- ============================================================
-- Trigger: update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_contestants_updated_at
  BEFORE UPDATE ON contestants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attempts_updated_at
  BEFORE UPDATE ON attempts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_answers_updated_at
  BEFORE UPDATE ON answers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
