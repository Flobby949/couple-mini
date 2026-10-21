CREATE TABLE users (
  id CHAR(32) PRIMARY KEY,
  openid VARCHAR(128) NOT NULL UNIQUE,
  nickname VARCHAR(40) NOT NULL,
  created_at DATETIME(6) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE couples (
  id CHAR(32) PRIMARY KEY,
  daily_limit BIGINT NULL,
  double_days INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL,
  CHECK (daily_limit IS NULL OR daily_limit >= 0)
) ENGINE=InnoDB;
CREATE TABLE members (
  user_id CHAR(32) PRIMARY KEY,
  couple_id CHAR(32) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (couple_id) REFERENCES couples(id)
) ENGINE=InnoDB;
CREATE TABLE invitations (
  code_hash CHAR(64) PRIMARY KEY,
  owner_id CHAR(32) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  used_by CHAR(32) NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE accounts (
  user_id CHAR(32) PRIMARY KEY,
  balance BIGINT NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE pools (
  couple_id CHAR(32) PRIMARY KEY,
  available BIGINT NOT NULL,
  reserved BIGINT NOT NULL DEFAULT 0,
  FOREIGN KEY (couple_id) REFERENCES couples(id),
  CHECK (available >= 0 AND reserved >= 0)
) ENGINE=InnoDB;
CREATE TABLE stores (
  id CHAR(32) PRIMARY KEY,
  owner_id CHAR(32) NOT NULL UNIQUE,
  FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE rule_proposals (
  id CHAR(32) PRIMARY KEY,
  couple_id CHAR(32) NOT NULL,
  proposer_id CHAR(32) NOT NULL,
  previous_limit BIGINT NULL,
  daily_limit BIGINT NOT NULL,
  status VARCHAR(16) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  confirmed_at DATETIME(6) NULL,
  INDEX (couple_id, status),
  FOREIGN KEY (couple_id) REFERENCES couples(id),
  FOREIGN KEY (proposer_id) REFERENCES users(id),
  CHECK (daily_limit >= 0)
) ENGINE=InnoDB;
CREATE TABLE checkins (
  user_id CHAR(32) NOT NULL,
  business_date DATE NOT NULL,
  couple_id CHAR(32) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (user_id, business_date),
  INDEX (couple_id, business_date),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (couple_id) REFERENCES couples(id)
) ENGINE=InnoDB;
CREATE TABLE milestones (
  couple_id CHAR(32) NOT NULL,
  days INT NOT NULL,
  reward BIGINT NOT NULL,
  reached_at DATETIME(6) NOT NULL,
  PRIMARY KEY (couple_id, days),
  FOREIGN KEY (couple_id) REFERENCES couples(id)
) ENGINE=InnoDB;
CREATE TABLE pool_ledger (
  id CHAR(32) PRIMARY KEY,
  couple_id CHAR(32) NOT NULL,
  actor_id CHAR(32) NOT NULL,
  reason VARCHAR(32) NOT NULL,
  amount BIGINT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  INDEX (couple_id, created_at),
  FOREIGN KEY (couple_id) REFERENCES couples(id)
) ENGINE=InnoDB;
CREATE TABLE daily_points (
  user_id CHAR(32) NOT NULL,
  business_date DATE NOT NULL,
  earned BIGINT NOT NULL DEFAULT 0,
  gifts_sent INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, business_date),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE operations (
  actor_id CHAR(32) NOT NULL,
  operation_key VARCHAR(80) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL,
  http_status INT NOT NULL,
  response JSON NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (actor_id, operation_key),
  FOREIGN KEY (actor_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE outbox (
  id CHAR(32) PRIMARY KEY,
  couple_id CHAR(32) NOT NULL,
  actor_id CHAR(32) NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  payload JSON NOT NULL,
  occurred_at DATETIME(6) NOT NULL,
  INDEX (occurred_at),
  FOREIGN KEY (couple_id) REFERENCES couples(id)
) ENGINE=InnoDB;
