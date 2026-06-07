CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS operators (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) DEFAULT 'operator',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS towers (
  id                 VARCHAR(50) PRIMARY KEY,
  name               VARCHAR(255) NOT NULL,
  lat                FLOAT NOT NULL,
  lng                FLOAT NOT NULL,
  status             VARCHAR(30) DEFAULT 'operational',
  coverage_radius_km FLOAT DEFAULT 2.0,
  active_complaints  INT DEFAULT 0,
  affected_users     INT DEFAULT 0,
  last_checked       TIMESTAMPTZ DEFAULT NOW(),
  metadata           JSONB
);

CREATE TABLE IF NOT EXISTS complaints (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source        VARCHAR(20) NOT NULL,
  raw_text      TEXT NOT NULL,
  location_hint VARCHAR(255),
  lat           FLOAT,
  lng           FLOAT,
  sender        VARCHAR(255),
  timestamp     TIMESTAMPTZ DEFAULT NOW(),
  status        VARCHAR(30) DEFAULT 'pending',
  issue_type    VARCHAR(50),
  severity      VARCHAR(20),
  confidence    FLOAT,
  cluster_id    UUID,
  tower_id      VARCHAR(50) REFERENCES towers(id),
  media_url     TEXT,
  metadata      JSONB
);

CREATE TABLE IF NOT EXISTS clusters (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_type        VARCHAR(50) NOT NULL,
  size              INT DEFAULT 0,
  center_lat        FLOAT,
  center_lng        FLOAT,
  radius_km         FLOAT,
  tower_id          VARCHAR(50) REFERENCES towers(id),
  status            VARCHAR(30) DEFAULT 'open',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recommendations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id       UUID REFERENCES clusters(id),
  tower_id         VARCHAR(50) REFERENCES towers(id),
  root_cause       TEXT NOT NULL,
  suggested_action TEXT NOT NULL,
  affected_users   INT DEFAULT 0,
  priority         VARCHAR(20) NOT NULL,
  confidence       FLOAT,
  status           VARCHAR(20) DEFAULT 'pending',
  operator_note    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at      TIMESTAMPTZ,
  reviewed_by      VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            VARCHAR(50) NOT NULL,
  severity        VARCHAR(20) NOT NULL,
  title           VARCHAR(255) NOT NULL,
  message         TEXT NOT NULL,
  tower_id        VARCHAR(50) REFERENCES towers(id),
  cluster_id      UUID REFERENCES clusters(id),
  read            BOOLEAN DEFAULT FALSE,
  action_required BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resolutions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID REFERENCES recommendations(id),
  tower_id          VARCHAR(50) REFERENCES towers(id),
  cluster_id        UUID REFERENCES clusters(id),
  status            VARCHAR(30) DEFAULT 'open',
  assigned_to       VARCHAR(255),
  resolved_at       TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id    UUID REFERENCES operators(id),
  role           VARCHAR(20) NOT NULL,
  content        TEXT NOT NULL,
  map_highlights JSONB,
  chart_data     JSONB,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_complaints_status     ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_cluster_id ON complaints(cluster_id);
CREATE INDEX IF NOT EXISTS idx_complaints_tower_id   ON complaints(tower_id);
CREATE INDEX IF NOT EXISTS idx_complaints_timestamp  ON complaints(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_read           ON alerts(read);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at     ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations(status);
