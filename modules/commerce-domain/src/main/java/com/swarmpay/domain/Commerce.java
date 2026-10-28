package com.swarmpay.domain;

import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public final class Commerce {
    private Commerce() {}
    public enum Category { TENTS, CATERING }
    public enum Operation { CREATE_ORDER, CAPTURE_ORDER, AUTHORIZE_ORDER, CAPTURE_AUTHORIZATION, VOID_AUTHORIZATION }
    public record Intent(String request, int attendees, int tents, long budgetMinor,
                         Instant eventAt, String timezone, String venue, String weather, String tentMode) {
        public Intent {
            if (request == null || request.isBlank() || request.length() > 4000) throw CommerceException.invalid("Describe the event in 1–4000 characters");
            if (attendees < 1 || attendees > 200 || tents < 1 || tents > 20) throw CommerceException.invalid("Choose 1–200 guests and 1–20 tents");
            Money.usd(budgetMinor);
            if (budgetMinor == 0) throw CommerceException.invalid("Budget must be positive");
            Objects.requireNonNull(eventAt, "Event date is required");
            try { ZoneId.of(timezone); } catch (RuntimeException e) { throw CommerceException.invalid("Use a valid timezone"); }
            if (venue == null || venue.isBlank() || venue.length() > 300) throw CommerceException.invalid("A venue is required");
            if (weather == null || weather.length() > 200) throw CommerceException.invalid("Weather constraint is too long");
            if (!"RENT".equals(tentMode)) throw CommerceException.invalid("The demo catalog offers tent rentals. Confirm renting before continuing.");
        }
    }
    public record Offer(String id, String merchantId, String merchantName, Category category,
                        String title, String description, long unitMinor, int capacity, String badge) {}
    public record Line(UUID id, String offerId, String merchantId, String merchantName,
                       Category category, String title, int quantity, long unitMinor, long totalMinor,
                       String paymentIntent) {}
    public record Assessment(String role, String summary, List<String> facts, String source) {}
    public record Plan(UUID id, int version, String ownerId, Intent intent, List<Line> lines,
                       List<Assessment> assessments, long totalMinor, Instant expiresAt,
                       String status, Instant createdAt) {
        public Plan {
            lines = List.copyOf(lines);
            assessments = List.copyOf(assessments);
        }
        public Plan approved() { return new Plan(id, version, ownerId, intent, lines, assessments, totalMinor, expiresAt, "APPROVED", createdAt); }
    }
    public record OrderView(UUID id, String merchantId, String merchantName, String title, Category category,
                            int quantity, long amountMinor, String paymentIntent, String status,
                            String providerOrderId, String authorizationId, String captureId) {}
    public record Event(long sequence, String type, String message, String source, Instant at,
                        String previousHash, String hash) {}
    public record Workflow(Plan plan, List<OrderView> orders, List<Event> events,
                           long committedMinor, long capturedMinor, String mode, boolean receiptVerified, boolean paymentFrozen,
                           List<AgentRequest> agentRequests) {}
    /** An agent's payment request that the authority decided without queuing a payment. */
    public record AgentRequest(PaymentCommand command, GateResult result, Instant at) {}
    /** One row of an organizer's payment ledger: a payment command, or an agent's request the authority decided. {@code requestedBy} is ORGANIZER, AGENT or SWARMPAY. */
    public record LedgerEntry(UUID id, Instant at, Instant settledAt, UUID workflowId, String venue, Instant eventAt, String merchantName, Category category,
                              Operation operation, String requestedBy, long amountMinor, String state, String execution, String message,
                              String dossierId, String providerOrderId, String authorizationId, String captureId) {}
    public record PaymentCommand(UUID id, UUID workflowId, int planVersion, UUID orderId, Operation operation,
                                 String merchantId, long amountMinor, String currency,
                                 String providerResourceId, String evidenceDigest, String reservationId, String policyVersion) {
        public PaymentCommand {
            Objects.requireNonNull(id); Objects.requireNonNull(workflowId); Objects.requireNonNull(orderId); Objects.requireNonNull(operation);
            Money.usd(amountMinor);
            if (!"USD".equals(currency)) throw CommerceException.invalid("Currency mismatch");
            if (planVersion < 1 || merchantId == null || reservationId == null || policyVersion == null || policyVersion.isBlank()) throw CommerceException.invalid("Incomplete payment command");
        }
        public String requestId() { return id.toString(); }
    }
    public record ProviderResult(String status, String providerOrderId, String authorizationId,
                                 String captureId, String approvalUrl, long amountMinor, String currency,
                                 String merchantId, String source) {}
    public record GateResult(String state, String execution, String decisionId, String dossierId,
                             String intentHash, String intentId, String message, ProviderResult result) {
        public boolean confirmed() { return result != null && "FORWARDED".equals(execution); }
    }
    public record Receipt(String issuer, UUID workflowId, UUID orderId, String merchantId, String venue,
                          int quantity, Instant deliveredAt, Instant issuedAt, String nonce) {}
    public record SignedReceipt(String payload, String signature) {}
    /** What the application recorded for a catering delivery; the venue signs these facts, never the browser's. */
    public record DeliveryFacts(UUID workflowId, UUID orderId, String merchantId, String venue, int quantity) {}
    public interface Catalog {
        List<Offer> offers();
        Offer get(String id);
    }
    /** The Sourcing Agent's choice of one offer per category and its reasons. Java validates the choice before any plan exists. */
    public record Proposal(String tentOfferId, String cateringOfferId, Assessment sourcing) {}
    public interface AgentPlanner {
        /** Both roles on offers the organizer chose. */
        List<Assessment> assess(Intent intent, List<Offer> offers);
        /** The Sourcing Agent chooses from the curated catalog. */
        Proposal propose(Intent intent, List<Offer> catalog);
        /** The Risk and Milestone Agent reviews the chosen offers. */
        Assessment review(Intent intent, List<Offer> offers);
        String source();
    }
    public record IntentSuggestion(Integer attendees, Integer tents, Long budgetMinor, String venue,
                                   String weather, String eventDate, List<String> clarifications, String source) {}
    public interface IntentInterpreter {
        IntentSuggestion interpret(String request, String timezone);
    }
    /** A facade bound to the authenticated MCP principal by server configuration. */
    public interface AgentActions {
        List<Offer> searchOffers(String category);
        Offer getOffer(String id);
        Plan proposeCheckout(Intent intent, String tentOfferId, String cateringOfferId);
        Workflow getWorkflow(UUID workflowId);
        List<Event> getEvidence(UUID workflowId);
        GateResult requestMilestonePayment(UUID workflowId);
    }
    public interface PaymentProvider {
        ProviderResult execute(PaymentCommand command, Plan plan, Line line);
        /** The buyer approved again after a declined funding source: a distinct provider request for the same command. */
        default ProviderResult execute(PaymentCommand command, Plan plan, Line line, int buyerAttempt) {
            if (buyerAttempt != 0) throw new IllegalArgumentException("This provider cannot attempt a buyer approval again");
            return execute(command, plan, line);
        }
        ProviderResult reconcile(PaymentCommand command, ProviderResult lastKnownResult);
    }
    public interface AuthorityGateway {
        GateResult execute(PaymentCommand command);
        GateResult reconcile(PaymentCommand command);
    }
}
