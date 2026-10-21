ALTER TABLE outbox ADD notification_context JSON NULL;
CREATE TABLE event_consumptions (
  event_id CHAR(32) NOT NULL,
  subscriber VARCHAR(40) NOT NULL,
  status VARCHAR(16) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(6) NOT NULL,
  last_error VARCHAR(80) NOT NULL DEFAULT '',
  completed_at DATETIME(6) NULL,
  PRIMARY KEY (event_id, subscriber),
  FOREIGN KEY (event_id) REFERENCES outbox(id)
) ENGINE=InnoDB;
CREATE TABLE notification_preferences (
  user_id CHAR(32) NOT NULL,
  template_code CHAR(3) NOT NULL,
  channel VARCHAR(16) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (user_id, template_code),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE notifications (
  sequence BIGINT PRIMARY KEY AUTO_INCREMENT,
  id CHAR(32) NOT NULL UNIQUE,
  event_id CHAR(32) NOT NULL,
  user_id CHAR(32) NOT NULL,
  template_code CHAR(3) NOT NULL,
  title VARCHAR(100) NOT NULL,
  body TEXT NOT NULL,
  target_type VARCHAR(16) NOT NULL,
  target_id VARCHAR(32) NOT NULL,
  in_app BOOLEAN NOT NULL,
  read_at DATETIME(6) NULL,
  occurred_at DATETIME(6) NOT NULL,
  received_at DATETIME(6) NOT NULL,
  UNIQUE (event_id,user_id,template_code),
  INDEX (user_id,in_app,occurred_at,sequence),
  FOREIGN KEY (event_id) REFERENCES outbox(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE subscription_authorizations (
  id CHAR(32) PRIMARY KEY,
  user_id CHAR(32) NOT NULL,
  report_id VARCHAR(80) NOT NULL,
  template_code CHAR(3) NOT NULL,
  platform_template VARCHAR(128) NOT NULL,
  result VARCHAR(16) NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(6) NOT NULL,
  UNIQUE (user_id,report_id),
  INDEX (user_id,platform_template,used,created_at),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE notification_deliveries (
  notification_id CHAR(32) PRIMARY KEY,
  user_id CHAR(32) NOT NULL,
  platform_template VARCHAR(128) NOT NULL,
  payload JSON NOT NULL,
  status VARCHAR(20) NOT NULL,
  reason VARCHAR(80) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(6) NOT NULL,
  lease_until DATETIME(6) NULL,
  updated_at DATETIME(6) NOT NULL,
  FOREIGN KEY (notification_id) REFERENCES notifications(id)
) ENGINE=InnoDB;
-- Old events have no preference/name snapshots. Preserve them, never fabricate historical notifications.
INSERT INTO event_consumptions(event_id,subscriber,status,next_attempt_at,last_error,completed_at)
 SELECT id,'notifications','skipped',UTC_TIMESTAMP(6),'legacy_without_snapshot',UTC_TIMESTAMP(6) FROM outbox;
