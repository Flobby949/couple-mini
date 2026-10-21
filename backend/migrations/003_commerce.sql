CREATE TABLE media_files (
  id CHAR(32) PRIMARY KEY,
  owner_id CHAR(32) NOT NULL,
  mime VARCHAR(32) NOT NULL,
  size_bytes INT NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE products (
  id CHAR(32) PRIMARY KEY,
  owner_id CHAR(32) NOT NULL,
  name VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  cover_id CHAR(32) NOT NULL,
  price BIGINT NOT NULL,
  stock INT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  INDEX (owner_id, created_at, id),
  FOREIGN KEY (owner_id) REFERENCES stores(owner_id),
  FOREIGN KEY (cover_id) REFERENCES media_files(id),
  CHECK (price >= 0 AND price <= 1000000000),
  CHECK (stock >= 0)
) ENGINE=InnoDB;
CREATE TABLE cart_items (
  user_id CHAR(32) NOT NULL,
  product_id CHAR(32) NOT NULL,
  added_at DATETIME(6) NOT NULL,
  PRIMARY KEY (user_id, product_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;
CREATE TABLE orders (
  id CHAR(32) PRIMARY KEY,
  couple_id CHAR(32) NOT NULL,
  buyer_id CHAR(32) NOT NULL,
  seller_id CHAR(32) NOT NULL,
  product_id CHAR(32) NOT NULL,
  snapshot_name VARCHAR(80) NOT NULL,
  snapshot_description TEXT NOT NULL,
  snapshot_cover_id CHAR(32) NOT NULL,
  points BIGINT NOT NULL,
  status VARCHAR(24) NOT NULL,
  cancel_pending BOOLEAN NOT NULL DEFAULT FALSE,
  auto_confirm_at DATETIME(6) NULL,
  refunded BIGINT NOT NULL DEFAULT 0,
  penalty BIGINT NOT NULL DEFAULT 0,
  ended_reason VARCHAR(32) NOT NULL DEFAULT '',
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  INDEX (couple_id, created_at, id),
  INDEX (couple_id, status, cancel_pending, auto_confirm_at),
  FOREIGN KEY (couple_id) REFERENCES couples(id),
  FOREIGN KEY (buyer_id) REFERENCES users(id),
  FOREIGN KEY (seller_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (snapshot_cover_id) REFERENCES media_files(id)
) ENGINE=InnoDB;
CREATE TABLE order_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id CHAR(32) NOT NULL,
  actor_id CHAR(32) NULL,
  action VARCHAR(32) NOT NULL,
  occurred_at DATETIME(6) NOT NULL,
  processed_at DATETIME(6) NOT NULL,
  INDEX (order_id, id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB;
CREATE TABLE account_ledger (
  id CHAR(32) PRIMARY KEY,
  user_id CHAR(32) NOT NULL,
  order_id CHAR(32) NOT NULL,
  reason VARCHAR(32) NOT NULL,
  amount BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  INDEX (user_id, created_at, id),
  UNIQUE (order_id, reason, user_id),
  FOREIGN KEY (user_id) REFERENCES accounts(user_id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB;
