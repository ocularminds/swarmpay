-- Agent payment requests the authority decided without queuing a payment. They
-- are never outbox commands, so they cannot be retried or replayed into one.
CREATE TABLE agent_requests (
    id uuid PRIMARY KEY,
    workflow_id uuid NOT NULL REFERENCES plans(id),
    command_json text NOT NULL,
    result_json text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_requests_workflow ON agent_requests(workflow_id,created_at);
