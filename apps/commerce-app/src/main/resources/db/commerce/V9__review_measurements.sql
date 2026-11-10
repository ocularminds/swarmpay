CREATE TABLE commerce.planning_measurements (
  workflow_id uuid PRIMARY KEY REFERENCES commerce.plans(id),
  planning_ms bigint NOT NULL CHECK(planning_ms>=0),
  brief_to_plan_ms bigint CHECK(brief_to_plan_ms>=0)
);
ALTER TABLE commerce.commands ADD COLUMN first_exception_at timestamptz;
-- Historical durations remain absent; the application records future observations without inventing old timing.
