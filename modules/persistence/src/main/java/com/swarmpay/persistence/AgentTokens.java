package com.swarmpay.persistence;

import com.swarmpay.domain.CommerceException;
import org.springframework.jdbc.core.JdbcTemplate;
import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;

/**
 * Agent access an organizer grants their own agents. A token acts only on its organizer's plans and is
 * stored as a SHA-256, so the database never holds a usable token; the organizer sees it once.
 */
public final class AgentTokens {
    public static final String PREFIX = "swp_";
    public static final int ACTIVE_LIMIT = 5;
    /** What the organizer sees about a token: never the token itself. */
    public record Grant(UUID id, String label, String hint, Instant createdAt, Instant lastUsedAt) {}
    /** The one time the token is shown. */
    public record Issued(Grant grant, String token) {}
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcTemplate db;
    public AgentTokens(DataSource dataSource) { db = new JdbcTemplate(dataSource); }

    public Issued issue(String owner, String label) {
        var name = label == null || label.isBlank() ? "Agent" : label.strip();
        if (name.length() > 60) throw CommerceException.invalid("Name the agent in 60 characters or fewer");
        if (active(owner).size() >= ACTIVE_LIMIT) throw new CommerceException("AGENT_LIMIT", "Revoke an agent before adding another; up to " + ACTIVE_LIMIT + " can be active", 409);
        byte[] bytes = new byte[32]; RANDOM.nextBytes(bytes);
        var token = PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        var id = UUID.randomUUID(); var hint = token.substring(token.length() - 4);
        var created = db.queryForObject("INSERT INTO commerce.agent_tokens(id,owner_id,token_sha256,label,hint) VALUES (?,?,?,?,?) RETURNING created_at",
            (r, n) -> r.getTimestamp(1).toInstant(), id, owner, sha256(token), name, hint);
        return new Issued(new Grant(id, name, hint, created, null), token);
    }
    public List<Grant> active(String owner) {
        return db.query("SELECT id,label,hint,created_at,last_used_at FROM commerce.agent_tokens WHERE owner_id=? AND revoked_at IS NULL ORDER BY created_at",
            (r, n) -> new Grant(r.getObject(1, UUID.class), r.getString(2), r.getString(3), r.getTimestamp(4).toInstant(),
                r.getTimestamp(5) == null ? null : r.getTimestamp(5).toInstant()), owner);
    }
    public void revoke(String owner, UUID id) {
        if (db.update("UPDATE commerce.agent_tokens SET revoked_at=now() WHERE id=? AND owner_id=? AND revoked_at IS NULL", id, owner) == 0)
            throw new CommerceException("NOT_FOUND", "Agent not found", 404);
    }
    /** The organizer an active token acts for, or empty for anything else. */
    public Optional<String> owner(String token) {
        if (token == null || !token.startsWith(PREFIX) || token.length() > 100) return Optional.empty();
        return db.query("UPDATE commerce.agent_tokens SET last_used_at=now() WHERE token_sha256=? AND revoked_at IS NULL RETURNING owner_id",
            (r, n) -> r.getString(1), sha256(token)).stream().findFirst();
    }
    static String sha256(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
}
