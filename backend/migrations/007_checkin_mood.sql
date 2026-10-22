ALTER TABLE checkins
  ADD COLUMN mood VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD CONSTRAINT chk_checkin_mood CHECK (mood IS NULL OR mood IN
    ('happy','calm','loving','missing','tired','sad','irritated','energetic'));
