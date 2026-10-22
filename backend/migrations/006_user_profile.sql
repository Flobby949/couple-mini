ALTER TABLE users
  ADD COLUMN avatar_id CHAR(32) NULL,
  ADD CONSTRAINT fk_users_avatar FOREIGN KEY (avatar_id) REFERENCES media_files(id);
