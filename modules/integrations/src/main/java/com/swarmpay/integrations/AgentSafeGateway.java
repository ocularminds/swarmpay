package com.swarmpay.integrations;

import com.swarmpay.domain.Commerce.*;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.Set;

/** HTTP client to the published AgentSafe gateway; it does not decide authority. */
public final class AgentSafeGateway implements AuthorityGateway {
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();
    private final String base;
    private final String serviceToken;
    public AgentSafeGateway(String base, String serviceToken) {
        this.base = base; this.serviceToken = serviceToken;
    }
    @Override public GateResult execute(PaymentCommand command) {
        return exchange(HttpRequest.newBuilder(URI.create(base + "/internal/payments/commands"))
            .POST(HttpRequest.BodyPublishers.ofString(Json.write(command))), false);
    }
    @Override public GateResult reconcile(PaymentCommand command) {
        return exchange(HttpRequest.newBuilder(URI.create(base + "/internal/payments/commands/" + command.id())).GET(), true);
    }
    private GateResult exchange(HttpRequest.Builder builder, boolean read) {
        try {
            var response = http.send(builder.timeout(Duration.ofSeconds(40)).header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + serviceToken).build(), HttpResponse.BodyHandlers.ofString());
            var h = response.headers();
            String decision = h.firstValue("agentsafe-decision").orElse(null);
            String dossier = h.firstValue("agentsafe-dossier-id").orElse(null);
            String hash = h.firstValue("agentsafe-intent-hash").orElse(null);
            String execution = h.firstValue("agentsafe-execution").orElse("NOT_FORWARDED");
            var body = Json.MAPPER.readTree(response.body());
            if (read) return Json.read(response.body(), GateResult.class);
            if (response.statusCode() >= 200 && response.statusCode() < 300 && "FORWARDED".equals(execution)) {
                if (!"ALLOW".equalsIgnoreCase(decision) || dossier == null || hash == null) return unknown("The gateway response is missing its authority binding.");
                var provider = Json.read(response.body(), ProviderResult.class);
                return new GateResult("SUCCEEDED", execution, h.firstValue("swarm-decision-id").orElse(null), dossier, hash, null, describe(provider), provider);
            }
            String state = body.path("state").asText("EXECUTION_FAILED");
            if (response.statusCode() >= 500 && !Set.of("AUTHORITY_UNAVAILABLE", "BLOCK", "ESCALATE").contains(state)) state = "INDETERMINATE";
            String message = body.path("message").asText(switch (state) {
                case "BLOCK", "BLOCKED" -> "Authority blocked this payment. No payment was dispatched.";
                case "ESCALATE", "HELD" -> "Authority requires review. Payment remains on hold.";
                case "AUTHORITY_UNAVAILABLE" -> "Authority is unavailable. Payment remains on hold.";
                default -> "Payment needs reconciliation before another attempt.";
            });
            return new GateResult(state, body.path("execution").asText(execution), body.path("decision_id").asText(null),
                body.path("dossier_id").asText(dossier), body.path("intent_hash").asText(hash), body.path("intent_id").asText(null), message, null);
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); return unknown("Payment request interrupted. Its outcome must be reconciled."); }
        catch (Exception e) { return unknown("Payment response unavailable. Its outcome must be reconciled."); }
    }
    private GateResult unknown(String message) { return new GateResult("INDETERMINATE", "INDETERMINATE", null,null,null,null,message,null); }
    public static String describe(ProviderResult p) {
        return switch (p.status()) {
            case "APPROVAL_REQUIRED" -> "Checkout is ready for " + p.merchantId() + ". Buyer approval is required.";
            case "AUTHORIZED" -> "Catering funds are authorized. Delivery confirmation is required before capture.";
            case "CAPTURED" -> "Payment capture confirmed for " + p.merchantId() + ".";
            case "VOIDED" -> "The authorization was voided.";
            default -> "Provider reports " + p.status() + ".";
        };
    }
}
