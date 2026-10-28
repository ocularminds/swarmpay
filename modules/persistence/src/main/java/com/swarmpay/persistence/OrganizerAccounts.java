package com.swarmpay.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import javax.sql.DataSource;
import java.util.UUID;

/** Organizers who signed up with PayPal: created on their first sign-in, refreshed on each one after. */
public final class OrganizerAccounts {
    /** {@code owner} is the name their plans are filed under; {@code created} is true on the first sign-in. */
    public record Account(UUID id, String owner, String name, String email, boolean created) {}
    private final JdbcTemplate db;
    public OrganizerAccounts(DataSource dataSource) { db = new JdbcTemplate(dataSource); }

    public Account signInWithPayPal(String userId, String name, String email, boolean emailVerified) {
        if (userId == null || userId.isBlank() || userId.length() > 300) throw new IllegalArgumentException("A PayPal user ID is required");
        // xmax is 0 only for a row this statement inserted, so it tells a new account from a returning one.
        return db.queryForObject("""
            INSERT INTO commerce.organizer_accounts(id,provider,provider_user_id,display_name,email,email_verified) VALUES (?,'PAYPAL',?,?,?,?)
            ON CONFLICT (provider,provider_user_id) DO UPDATE SET display_name=EXCLUDED.display_name,email=EXCLUDED.email,
                email_verified=EXCLUDED.email_verified,last_sign_in_at=now()
            RETURNING id,display_name,email,(xmax=0) AS created
            """, (r, n) -> { var id = r.getObject(1, UUID.class); return new Account(id, "paypal:" + id, r.getString(2), r.getString(3), r.getBoolean(4)); },
            UUID.randomUUID(), userId, name, email, emailVerified);
    }
}
