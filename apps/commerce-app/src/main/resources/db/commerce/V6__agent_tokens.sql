-- Agent access an organizer grants their own agents: each token acts only on
-- that organizer's plans, can never approve one, and can be revoked. Only a
-- SHA-256 of the token is kept; the token itself is shown once.
CREATE TABLE agent_tokens (
    id uuid PRIMARY KEY,
    owner_id varchar(120) NOT NULL,
    token_sha256 char(64) NOT NULL UNIQUE,
    label varchar(60) NOT NULL,
    hint varchar(8) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz,
    revoked_at timestamptz
);
CREATE INDEX agent_tokens_owner ON agent_tokens(owner_id,created_at);
