package com.swarmpay.integrations;

import com.swarmpay.domain.Commerce.*;
import com.swarmpay.domain.CommerceException;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.X509EncodedKeySpec;
import java.time.*;
import java.util.Base64;
import java.util.HexFormat;

public final class ReceiptVerifier {
    /** A venue attests delivery from two hours before the event until four hours after it. */
    private static final Duration EARLIEST = Duration.ofHours(2), LATEST = Duration.ofHours(4);
    private final PublicKey key;
    private final String issuer;
    private final Clock clock;
    public ReceiptVerifier(PublicKey key, String issuer, Clock clock) { this.key = key; this.issuer = issuer; this.clock = clock; }
    public Receipt verify(SignedReceipt envelope, Plan plan, Line line) {
        try {
            if (envelope.payload().length() > 16000 || envelope.signature().length() > 512) throw CommerceException.invalid("Receipt too large");
            byte[] body = Base64.getDecoder().decode(envelope.payload());
            var verifier = Signature.getInstance("Ed25519");
            verifier.initVerify(key); verifier.update(body);
            if (!verifier.verify(Base64.getDecoder().decode(envelope.signature()))) throw CommerceException.held("Receipt signature is invalid");
            Receipt r = Json.read(new String(body, StandardCharsets.UTF_8), Receipt.class);
            if (!issuer.equals(r.issuer()) || !plan.id().equals(r.workflowId()) || !line.id().equals(r.orderId())
                    || !line.merchantId().equals(r.merchantId()) || !plan.intent().venue().equals(r.venue())
                    || r.quantity() != line.quantity()) throw CommerceException.held("Receipt does not match the approved delivery");
            Instant now = clock.instant();
            if (r.issuedAt() == null || r.deliveredAt() == null || r.nonce() == null || !r.nonce().matches("[a-zA-Z0-9-]{16,100}"))
                throw CommerceException.held("Receipt is missing required evidence");
            if (r.issuedAt().isAfter(now.plusSeconds(60)) || r.issuedAt().isBefore(now.minus(Duration.ofMinutes(15)))
                    || r.deliveredAt().isAfter(now.plusSeconds(60)) || r.deliveredAt().isAfter(r.issuedAt().plusSeconds(60))
                    || r.deliveredAt().isBefore(plan.intent().eventAt().minus(EARLIEST))
                    || r.deliveredAt().isAfter(plan.intent().eventAt().plus(LATEST)))
                throw CommerceException.held("Receipt is stale or outside the delivery window");
            return r;
        } catch (CommerceException e) { throw e; }
        catch (Exception e) { throw CommerceException.held("Receipt could not be verified"); }
    }
    /** Whether a delivery attested now would fall inside the event's delivery window. */
    public void checkDeliveryWindow(Plan plan) {
        Instant now = clock.instant(), event = plan.intent().eventAt();
        if (now.isBefore(event.minus(EARLIEST))) throw CommerceException.held("The venue can confirm delivery from two hours before the event.");
        if (now.isAfter(event.plus(LATEST))) throw CommerceException.held("The delivery window for this event has closed.");
    }
    public static PublicKey publicKey(String pem) {
        try {
            String value = pem.replace("-----BEGIN PUBLIC KEY-----", "").replace("-----END PUBLIC KEY-----", "").replaceAll("\\s", "");
            return KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(value)));
        } catch (Exception e) { throw new IllegalArgumentException("Invalid Ed25519 public key", e); }
    }
    public static String digest(String input) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
}
