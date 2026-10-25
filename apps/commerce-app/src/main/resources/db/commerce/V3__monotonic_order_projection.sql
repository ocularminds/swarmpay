-- Delayed replies must not roll a later payment phase back to an earlier one.
ALTER TABLE orders ADD COLUMN projection_rank integer NOT NULL DEFAULT 0
    CHECK(projection_rank BETWEEN 0 AND 5);
UPDATE orders o SET projection_rank = CASE o.status
    WHEN 'APPROVAL_REQUIRED' THEN 1
    WHEN 'AUTHORIZED' THEN 3
    WHEN 'CAPTURED' THEN 5
    WHEN 'VOIDED' THEN 5
    WHEN 'PENDING' THEN CASE WHEN EXISTS (
        SELECT 1 FROM commands c WHERE c.order_id=o.id
          AND c.operation IN ('CAPTURE_AUTHORIZATION','VOID_AUTHORIZATION')
          AND c.result_json::jsonb->'result'->>'status'='PENDING'
    ) THEN 4 ELSE 2 END
    ELSE 0 END;
