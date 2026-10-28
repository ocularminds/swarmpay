-- Organizers who signed up with PayPal. PayPal's user ID is the identity; the
-- name and email are refreshed from PayPal on every sign-in. Their plans name
-- them as paypal:<id>; the configured password organizer keeps its username.
CREATE TABLE organizer_accounts (
    id uuid PRIMARY KEY,
    provider varchar(20) NOT NULL CHECK(provider IN ('PAYPAL')),
    provider_user_id varchar(300) NOT NULL,
    display_name varchar(120),
    email varchar(254),
    email_verified boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_sign_in_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(provider, provider_user_id)
);
