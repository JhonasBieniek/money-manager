ALTER TABLE expenses ADD COLUMN goal_category text NOT NULL DEFAULT 'custos-fixos';
CREATE INDEX IF NOT EXISTS expenses_goal_category_idx ON expenses (goal_category);
