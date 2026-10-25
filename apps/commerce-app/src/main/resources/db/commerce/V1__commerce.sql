CREATE TABLE plans (
    id uuid PRIMARY KEY,
    owner_id varchar(120) NOT NULL,
    version integer NOT NULL CHECK(version > 0),
    plan_json text NOT NULL,
    status varchar(30) NOT NULL,
    consent_at timestamptz,
    payment_frozen boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE orders (
    id uuid PRIMARY KEY,
    workflow_id uuid NOT NULL REFERENCES plans(id),
    merchant_id varchar(60) NOT NULL,
    line_json text NOT NULL,
    status varchar(40) NOT NULL,
    provider_order_id varchar(100),
    authorization_id varchar(100),
    capture_id varchar(100),
    UNIQUE(workflow_id, merchant_id)
);
CREATE TABLE reservations (
    workflow_id uuid PRIMARY KEY REFERENCES plans(id),
    amount_minor bigint NOT NULL CHECK(amount_minor > 0),
    budget_minor bigint NOT NULL CHECK(budget_minor >= amount_minor),
    state varchar(20) NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE commands (
    id uuid PRIMARY KEY,
    workflow_id uuid NOT NULL REFERENCES plans(id),
    order_id uuid NOT NULL REFERENCES orders(id),
    operation varchar(40) NOT NULL,
    command_json text NOT NULL,
    state varchar(40) NOT NULL,
    result_json text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(order_id,operation)
);
CREATE INDEX commands_queue ON commands(state,created_at);
CREATE TABLE receipts (
    workflow_id uuid NOT NULL REFERENCES plans(id),
    order_id uuid NOT NULL REFERENCES orders(id),
    issuer varchar(120) NOT NULL,
    nonce varchar(100) NOT NULL,
    digest varchar(64) NOT NULL,
    envelope_json text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(issuer,nonce),
    UNIQUE(order_id,digest)
);
CREATE TABLE photos (
    id uuid PRIMARY KEY,
    workflow_id uuid NOT NULL REFERENCES plans(id),
    mime varchar(50) NOT NULL,
    digest varchar(64) NOT NULL,
    content bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE events (
    workflow_id uuid NOT NULL REFERENCES plans(id),
    sequence bigint NOT NULL,
    type varchar(80) NOT NULL,
    message text NOT NULL,
    source varchar(80) NOT NULL,
    created_at timestamptz NOT NULL,
    previous_hash varchar(64) NOT NULL,
    hash varchar(64) NOT NULL,
    PRIMARY KEY(workflow_id,sequence)
);
