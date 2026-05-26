PRAGMA foreign_keys=OFF;
ALTER TABLE expenses RENAME TO expenses_old;
CREATE TABLE expenses (
	`id` text PRIMARY KEY NOT NULL,
	`amount_cents` integer NOT NULL,
	`description` text NOT NULL,
	`establishment` text,
	`payment_method` text DEFAULT 'credit_card' NOT NULL,
	`card_last_four` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`ocr_status` text,
	`idempotency_key` text,
	`ocr_raw` text,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
INSERT INTO expenses (
  id, amount_cents, description, establishment, payment_method, card_last_four, source, ocr_status,
  idempotency_key, ocr_raw, occurred_at, created_at, updated_at, deleted_at
) SELECT
  id, amount_cents, description, establishment, payment_method, card_last_four, source, ocr_status,
  idempotency_key, ocr_raw, occurred_at, created_at, updated_at, deleted_at
FROM expenses_old;
DROP TABLE expenses_old;

ALTER TABLE expense_tags RENAME TO expense_tags_old;
CREATE TABLE expense_tags (
  expense_id text NOT NULL,
  tag_id text NOT NULL,
  PRIMARY KEY(expense_id, tag_id),
  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON UPDATE no action ON DELETE cascade
);
INSERT INTO expense_tags (expense_id, tag_id) SELECT expense_id, tag_id FROM expense_tags_old;
DROP TABLE expense_tags_old;

DROP TABLE IF EXISTS categories;

CREATE INDEX expenses_occurred_idx ON expenses (occurred_at);
CREATE INDEX expenses_deleted_idx ON expenses (deleted_at);
CREATE UNIQUE INDEX expenses_idempotency_key_uidx ON expenses (idempotency_key);

CREATE INDEX expense_tags_tag_id_idx ON expense_tags (tag_id);
CREATE INDEX expense_tags_tag_expense_idx ON expense_tags (tag_id, expense_id);

PRAGMA foreign_keys=ON;
