CREATE TABLE attempts (
    id uuid PRIMARY KEY,
    workflow_id uuid NOT NULL,
    order_id uuid NOT NULL,
    operation varchar(40) NOT NULL,
    command_json text NOT NULL,
    command_hash varchar(64) NOT NULL,
    intent_hash varchar(100) NOT NULL,
    dossier_id varchar(150) NOT NULL,
    state varchar(30) NOT NULL,
    result_json text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(order_id, operation)
);
CREATE TABLE webhooks (
    id varchar(150) PRIMARY KEY,
    merchant_id varchar(60) NOT NULL,
    event_json text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now()
);
