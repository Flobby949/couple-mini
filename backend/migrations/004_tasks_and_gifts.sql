CREATE TABLE tasks (
  id CHAR(32) PRIMARY KEY,
  couple_id CHAR(32) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  creator_id CHAR(32) NOT NULL,
  partner_id CHAR(32) NOT NULL,
  name VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  reward BIGINT NOT NULL,
  status VARCHAR(24) NOT NULL,
  deadline DATETIME(6) NULL,
  correction_deadline DATETIME(6) NULL,
  submitted_by CHAR(32) NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  INDEX (couple_id, kind, created_at, id),
  INDEX (couple_id, kind, status, deadline, correction_deadline),
  FOREIGN KEY (couple_id) REFERENCES couples(id),
  FOREIGN KEY (creator_id) REFERENCES users(id),
  FOREIGN KEY (partner_id) REFERENCES users(id),
  CHECK (reward >= 0 AND reward <= 1000000000)
) ENGINE=InnoDB;
CREATE TABLE task_cancellations (
  id CHAR(32) PRIMARY KEY,
  task_id CHAR(32) NOT NULL,
  requester_id CHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  decided_at DATETIME(6) NULL,
  active_task_id CHAR(32) GENERATED ALWAYS AS (CASE WHEN status='pending' THEN task_id ELSE NULL END) STORED,
  UNIQUE (active_task_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (requester_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE task_reservations (
  task_id CHAR(32) PRIMARY KEY,
  couple_id CHAR(32) NOT NULL,
  amount BIGINT NOT NULL,
  status VARCHAR(16) NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (couple_id) REFERENCES couples(id),
  CHECK (amount >= 0)
) ENGINE=InnoDB;
CREATE TABLE reservation_history (
  id CHAR(32) PRIMARY KEY,
  task_id CHAR(32) NOT NULL,
  couple_id CHAR(32) NOT NULL,
  delta BIGINT NOT NULL,
  reason VARCHAR(32) NOT NULL,
  occurred_at DATETIME(6) NOT NULL,
  INDEX (couple_id, occurred_at, id),
  FOREIGN KEY (task_id) REFERENCES tasks(id)
) ENGINE=InnoDB;
CREATE TABLE point_gifts (
  id CHAR(32) PRIMARY KEY,
  couple_id CHAR(32) NOT NULL,
  sender_id CHAR(32) NOT NULL,
  receiver_id CHAR(32) NOT NULL,
  requested BIGINT NOT NULL,
  actual BIGINT NOT NULL,
  discarded BIGINT NOT NULL,
  daily_limit BIGINT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  INDEX (couple_id, created_at, id),
  FOREIGN KEY (couple_id) REFERENCES couples(id),
  FOREIGN KEY (sender_id) REFERENCES users(id),
  FOREIGN KEY (receiver_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE task_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_id CHAR(32) NOT NULL,
  actor_id CHAR(32) NULL,
  action VARCHAR(32) NOT NULL,
  occurred_at DATETIME(6) NOT NULL,
  processed_at DATETIME(6) NOT NULL,
  result JSON NOT NULL,
  INDEX (task_id, id),
  FOREIGN KEY (task_id) REFERENCES tasks(id)
) ENGINE=InnoDB;
ALTER TABLE pool_ledger ADD task_id CHAR(32) NULL, ADD FOREIGN KEY (task_id) REFERENCES tasks(id);
ALTER TABLE account_ledger MODIFY order_id CHAR(32) NULL;
ALTER TABLE account_ledger ADD task_id CHAR(32) NULL, ADD gift_id CHAR(32) NULL,
  ADD FOREIGN KEY (task_id) REFERENCES tasks(id),
  ADD FOREIGN KEY (gift_id) REFERENCES point_gifts(id),
  ADD UNIQUE (task_id, reason, user_id), ADD UNIQUE (gift_id, reason, user_id),
  ADD CHECK ((order_id IS NOT NULL)+(task_id IS NOT NULL)+(gift_id IS NOT NULL)=1);
