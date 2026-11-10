-- Reconciliation checks update updated_at. Preserve the first completed provider result separately.
ALTER TABLE commerce.commands ADD COLUMN settled_at timestamptz;
UPDATE commerce.commands SET settled_at=updated_at
WHERE state='SUCCEEDED' AND result_json::jsonb->'result'->>'status' IS NOT NULL
  AND result_json::jsonb->'result'->>'status'<>'PENDING';
-- Historical rows retain the best recorded timestamp available at migration; no provider time is invented.
