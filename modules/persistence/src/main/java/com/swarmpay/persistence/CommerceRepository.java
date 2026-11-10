package com.swarmpay.persistence;

import com.swarmpay.domain.Commerce.*;
import com.swarmpay.domain.CommerceException;
import com.swarmpay.domain.Money;
import com.swarmpay.domain.PlanFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import java.util.function.Supplier;

public final class CommerceRepository {
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    public CommerceRepository(DataSource dataSource) {
        db = new JdbcTemplate(dataSource);
        tx = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
    }
    public <T> T transaction(Supplier<T> work) { return tx.execute(s -> work.get()); }
    public <T> T snapshot(Supplier<T> work) {
        var read=new TransactionTemplate(tx.getTransactionManager());
        read.setReadOnly(true);read.setIsolationLevel(org.springframework.transaction.TransactionDefinition.ISOLATION_REPEATABLE_READ);
        return read.execute(s->work.get());
    }
    public void create(Plan plan) {
        create(plan,null);
    }
    public void create(Plan plan,Long planningMillis) {
        transaction(() -> {
            db.update("INSERT INTO commerce.plans(id,owner_id,version,plan_json,status) VALUES (?,?,?,?,?)", plan.id(), plan.ownerId(), plan.version(), DbJson.write(plan), plan.status());
            for (var line : plan.lines()) db.update("""
                INSERT INTO commerce.orders(id,workflow_id,merchant_id,line_json,status) VALUES (?,?,?,?,'NEW')
                """, line.id(), plan.id(), line.merchantId(), DbJson.write(line));
            appendInside(plan.id(), "PLAN_CREATED", "A plan was prepared for your review.", "APPLICATION");
            if(planningMillis!=null)db.update("INSERT INTO commerce.planning_measurements(workflow_id,planning_ms) VALUES (?,?)",plan.id(),planningMillis);
            return null;
        });
    }
    public void briefTiming(UUID workflowId,long elapsedMillis) {
        db.update("UPDATE commerce.planning_measurements SET brief_to_plan_ms=? WHERE workflow_id=?",elapsedMillis,workflowId);
    }
    /** Organizer-scoped measurements; no descriptions, venue names, credentials or model payloads are exported. */
    public List<ReviewMeasurement> measurements(String owner) {
        return db.query("""
            SELECT p.id,m.planning_ms,m.brief_to_plan_ms,
              (SELECT count(*) FROM commerce.events e WHERE e.workflow_id=p.id AND e.source='HUMAN') AS actions,
              (SELECT count(*) FROM commerce.agent_requests a WHERE a.workflow_id=p.id AND a.result_json::jsonb->>'state' IN ('HELD','ESCALATE','BLOCK','BLOCKED')) AS held,
              (SELECT extract(epoch FROM(c.settled_at-min(r.created_at)))*1000 FROM commerce.commands c
                JOIN commerce.receipts r ON r.order_id=c.order_id WHERE c.workflow_id=p.id AND c.operation='CAPTURE_AUTHORIZATION'
                AND c.state='SUCCEEDED' AND c.result_json::jsonb->'result'->>'status'='CAPTURED' GROUP BY c.id) AS delivery_ms,
              (SELECT COALESCE(sum(extract(epoch FROM(c.settled_at-c.first_exception_at))*1000),0) FROM commerce.commands c
                WHERE c.workflow_id=p.id AND c.first_exception_at IS NOT NULL AND c.settled_at IS NOT NULL) AS exception_ms,
              (SELECT count(*) FROM commerce.commands c WHERE c.workflow_id=p.id AND c.first_exception_at IS NOT NULL AND c.settled_at IS NOT NULL) AS resolved,
              (SELECT count(*) FROM commerce.commands c WHERE c.workflow_id=p.id AND c.first_exception_at IS NOT NULL AND c.settled_at IS NULL) AS unresolved
            FROM commerce.plans p LEFT JOIN commerce.planning_measurements m ON m.workflow_id=p.id WHERE p.owner_id=? ORDER BY p.created_at DESC
            """,(r,n)->new ReviewMeasurement(r.getObject("id",UUID.class),r.getObject("planning_ms",Long.class),r.getObject("brief_to_plan_ms",Long.class),
                r.getLong("actions"),r.getLong("held"),r.getObject("delivery_ms")==null?null:r.getLong("delivery_ms"),r.getLong("exception_ms"),r.getLong("resolved"),r.getLong("unresolved")),owner);
    }
    public Plan owned(UUID id, String owner) {
        var plans = db.query("SELECT plan_json FROM commerce.plans WHERE id=? AND owner_id=?", (r,n) -> DbJson.read(r.getString(1), Plan.class), id, owner);
        if (plans.isEmpty()) throw new CommerceException("NOT_FOUND", "Plan not found", 404);
        return plans.getFirst();
    }
    public Plan approvedForExecution(UUID id) {
        return approved(id,false);
    }
    public Plan approvedForVoid(UUID id) {
        return approved(id,true);
    }
    private Plan approved(UUID id,boolean allowFrozen) {
        var plans = db.query("SELECT plan_json FROM commerce.plans WHERE id=? AND status='APPROVED' AND consent_at IS NOT NULL AND (payment_frozen=false OR ?)", (r,n) -> DbJson.read(r.getString(1), Plan.class), id,allowFrozen);
        if (plans.isEmpty()) throw CommerceException.held("The plan is frozen or has no recorded human consent");
        return plans.getFirst();
    }
    public List<Plan> list(String owner) {
        return db.query("SELECT plan_json FROM commerce.plans WHERE owner_id=? ORDER BY created_at DESC LIMIT 30", (r,n) -> DbJson.read(r.getString(1), Plan.class), owner);
    }
    public Plan approve(UUID id, String owner, int version, PlanFactory factory) {
        return transaction(() -> {
            lock(id);
            var plan = owned(id, owner);
            if (plan.version() != version) throw CommerceException.conflict("The reviewed plan version changed");
            if (plan.status().equals("APPROVED")) return plan;
            factory.checkApproval(plan);
            var approved = plan.approved();
            db.update("INSERT INTO commerce.reservations(workflow_id,amount_minor,budget_minor) VALUES (?,?,?)", id, plan.totalMinor(), plan.intent().budgetMinor());
            db.update("UPDATE commerce.plans SET status='APPROVED',consent_at=now(),plan_json=? WHERE id=?", DbJson.write(approved), id);
            appendInside(id, "PLAN_APPROVED", "You approved the merchants, amounts and delivery condition. The total budget is reserved.", "HUMAN");
            return approved;
        });
    }
    public List<OrderView> orders(Plan plan) {
        return db.query("SELECT line_json,status,provider_order_id,authorization_id,capture_id FROM commerce.orders WHERE workflow_id=? ORDER BY merchant_id DESC", (r,n) -> {
            var line = DbJson.read(r.getString("line_json"), Line.class);
            return new OrderView(line.id(), line.merchantId(), line.merchantName(), line.title(), line.category(), line.quantity(),
                line.totalMinor(), line.paymentIntent(), r.getString("status"), r.getString("provider_order_id"), r.getString("authorization_id"), r.getString("capture_id"));
        }, plan.id());
    }
    public OrderView order(Plan plan, UUID orderId) {
        return orders(plan).stream().filter(o -> o.id().equals(orderId)).findFirst().orElseThrow(() -> CommerceException.invalid("Order does not belong to the plan"));
    }
    public Line line(Plan plan, UUID orderId) {
        return plan.lines().stream().filter(o -> o.id().equals(orderId)).findFirst().orElseThrow(() -> CommerceException.invalid("Order does not belong to the plan"));
    }
    public boolean reservationMatches(PaymentCommand command, Plan plan) {
        long amount = committedMinor(command.workflowId());
        return amount == plan.totalMinor() && amount <= plan.intent().budgetMinor()
            && command.reservationId().equals(plan.id().toString());
    }
    public long committedMinor(UUID workflowId) {
        return db.queryForObject("SELECT COALESCE(sum(amount_minor),0) FROM commerce.reservations WHERE workflow_id=? AND state='ACTIVE'", Long.class, workflowId);
    }
    /** One SQL snapshot: ownership, actual reservations, settled balances and unresolved command exposure. */
    public List<PlanBalance> balances(String owner) {
        return db.query("""
            SELECT p.id,p.plan_json,p.payment_frozen,
              COALESCE(r.amount_minor,0) AS committed,
              EXISTS(SELECT 1 FROM commerce.events e WHERE e.workflow_id=p.id AND e.type='PLAN_CANCELLED') AS cancelled,
              COALESCE(sum((o.line_json::jsonb->>'totalMinor')::bigint) FILTER(WHERE o.status='CAPTURED'),0) AS captured,
              COALESCE(sum((o.line_json::jsonb->>'totalMinor')::bigint) FILTER(WHERE o.status='AUTHORIZED'),0) AS authorized,
              COALESCE(sum((o.line_json::jsonb->>'totalMinor')::bigint) FILTER(WHERE o.status='REFUNDED'),0) AS refunded,
              COALESCE(sum((o.line_json::jsonb->>'totalMinor')::bigint) FILTER(WHERE o.status='PENDING' OR pending.active),0) AS pending,
              COALESCE(sum((o.line_json::jsonb->>'totalMinor')::bigint) FILTER(WHERE o.status='CAPTURED' AND pending.refund),0) AS refund_pending,
              string_agg(o.status,',' ORDER BY o.merchant_id) AS order_states
            FROM commerce.plans p JOIN commerce.orders o ON o.workflow_id=p.id
            LEFT JOIN commerce.reservations r ON r.workflow_id=p.id AND r.state='ACTIVE'
            LEFT JOIN LATERAL (
              SELECT bool_or(c.state IN ('QUEUED','DISPATCHING','INDETERMINATE','EXECUTION_INDETERMINATE')
                OR c.result_json::jsonb->'result'->>'status'='PENDING') AS active,
                bool_or(c.operation='REFUND_CAPTURE' AND NOT(c.state='SUCCEEDED'
                  AND COALESCE(c.result_json::jsonb->'result'->>'status','')='REFUNDED')) AS refund
              FROM commerce.commands c WHERE c.order_id=o.id
            ) pending ON true
            WHERE p.owner_id=? AND p.status='APPROVED'
            GROUP BY p.id,p.plan_json,p.payment_frozen,p.created_at,r.amount_minor ORDER BY p.created_at DESC
            """, (r,n) -> {
                var plan=DbJson.read(r.getString("plan_json"),Plan.class);
                return new PlanBalance(plan.id(),plan.intent().venue(),plan.intent().eventAt(),plan.intent().budgetMinor(),plan.totalMinor(),
                    r.getLong("committed"),r.getLong("captured"),r.getLong("authorized"),r.getLong("refunded"),r.getLong("pending"),
                    r.getLong("refund_pending"),r.getBoolean("payment_frozen"),r.getBoolean("cancelled"),List.of(r.getString("order_states").split(",")));
            },owner);
    }
    public PaymentCommand enqueue(PaymentCommand proposed) {
        db.update("""
            INSERT INTO commerce.commands(id,workflow_id,order_id,operation,command_json,state)
            VALUES (?,?,?,?,?,'QUEUED') ON CONFLICT(order_id,operation) DO NOTHING
            """, proposed.id(), proposed.workflowId(), proposed.orderId(), proposed.operation().name(), DbJson.write(proposed));
        var existing = db.queryForObject("SELECT command_json FROM commerce.commands WHERE order_id=? AND operation=?", (r,n) -> DbJson.read(r.getString(1), PaymentCommand.class), proposed.orderId(), proposed.operation().name());
        var normalized = new PaymentCommand(existing.id(),proposed.workflowId(),proposed.planVersion(),proposed.orderId(),proposed.operation(),
            proposed.merchantId(),proposed.amountMinor(),proposed.currency(),proposed.providerResourceId(),proposed.evidenceDigest(),proposed.reservationId(),proposed.policyVersion());
        if (!existing.equals(normalized)) throw CommerceException.conflict("An existing payment command is bound to different details");
        return existing;
    }
    public List<PaymentCommand> queued() {
        return db.query("SELECT command_json FROM commerce.commands WHERE state='QUEUED' ORDER BY created_at LIMIT 10", (r,n) -> DbJson.read(r.getString(1), PaymentCommand.class));
    }
    public boolean claim(UUID commandId) { return db.update("UPDATE commerce.commands SET state='DISPATCHING',updated_at=now() WHERE id=? AND state='QUEUED'", commandId) == 1; }
    public List<PaymentCommand> needsReconciliation() {
        return db.query("""
            SELECT command_json FROM commerce.commands WHERE updated_at < now()-interval '60 seconds'
            AND (state IN ('DISPATCHING','INDETERMINATE','EXECUTION_INDETERMINATE')
                OR (state='SUCCEEDED' AND result_json::jsonb->'result'->>'status'='PENDING')) ORDER BY updated_at LIMIT 10
            """, (r,n) -> DbJson.read(r.getString(1),PaymentCommand.class));
    }
    public void touch(UUID id) { db.update("UPDATE commerce.commands SET updated_at=now() WHERE id=?",id); }
    public void retryNotForwarded(PaymentCommand command) {
        transaction(() -> {
            lock(command.workflowId());
            var result=commandResult(command.id());
            if(result==null || !"NOT_FORWARDED".equals(result.execution()) || !Set.of("AUTHORITY_UNAVAILABLE","NOT_EXECUTED").contains(result.state()))
                throw CommerceException.held("Only a confirmed non-dispatch can be retried. Reconcile uncertain payments first.");
            db.update("UPDATE commerce.commands SET state='QUEUED',result_json=NULL,updated_at=now() WHERE id=?",command.id());
            appendInside(command.workflowId(),"PAYMENT_RETRY_REQUESTED","The same payment identity was queued for a fresh authority decision.","HUMAN");
            return null;
        });
    }
    /**
     * PayPal declined the buyer's funding source and took no payment. A new native approval of the
     * same order queues the same command for a fresh authority decision; nothing else can.
     */
    public void requeueAfterBuyerAction(UUID workflowId, UUID orderId, Operation operation) {
        transaction(() -> {
            lock(workflowId);
            if (db.update("UPDATE commerce.commands SET state='QUEUED',result_json=NULL,updated_at=now() WHERE order_id=? AND operation=? AND state='BUYER_ACTION_REQUIRED'",
                    orderId, operation.name()) == 1)
                appendInside(workflowId,"BUYER_REAPPROVED","You approved this checkout again with another way to pay. The same payment was queued for a fresh authority decision.","HUMAN");
            return null;
        });
    }
    public boolean recordedCommandMatches(PaymentCommand command) {
        var rows=db.query("SELECT command_json FROM commerce.commands WHERE id=?",(r,n)->DbJson.read(r.getString(1),PaymentCommand.class),command.id());
        return rows.size()==1 && rows.getFirst().equals(command);
    }
    public List<PaymentCommand> commandsFor(Plan plan) {
        return db.query("SELECT command_json FROM commerce.commands WHERE workflow_id=? ORDER BY created_at",(r,n)->DbJson.read(r.getString(1),PaymentCommand.class),plan.id());
    }
    public List<Plan> readyMilestones() {
        return db.query("""
            SELECT p.plan_json FROM commerce.plans p JOIN commerce.orders o ON o.workflow_id=p.id
            WHERE p.status='APPROVED' AND p.payment_frozen=false AND o.status='AUTHORIZED'
              AND EXISTS (SELECT 1 FROM commerce.receipts r WHERE r.order_id=o.id)
              AND NOT EXISTS (SELECT 1 FROM commerce.commands c WHERE c.order_id=o.id AND c.operation='CAPTURE_AUTHORIZATION') LIMIT 10
            """,(r,n)->DbJson.read(r.getString(1),Plan.class));
    }
    /**
     * Catering holds whose 3-day honor period has passed, for events that start within 3 days: renewing
     * now gives the delivery a fresh honor period. One renewal per order, never for a frozen plan.
     */
    public List<Plan> holdsToRenew() {
        // Only events still ahead: a hold whose delivery has passed is never renewed. Filtering here, before the
        // limit, also keeps such stale holds from filling it and starving one that is due.
        return db.query("""
            SELECT p.plan_json FROM commerce.plans p JOIN commerce.orders o ON o.workflow_id=p.id
            JOIN commerce.commands a ON a.order_id=o.id AND a.operation='AUTHORIZE_ORDER' AND a.state='SUCCEEDED'
            WHERE p.status='APPROVED' AND p.payment_frozen=false AND o.status='AUTHORIZED'
              AND a.settled_at < now() - interval '3 days'
              AND (p.plan_json::jsonb->'intent'->>'eventAt')::timestamptz > now()
              AND (p.plan_json::jsonb->'intent'->>'eventAt')::timestamptz < now() + interval '3 days'
              AND NOT EXISTS (SELECT 1 FROM commerce.commands c WHERE c.order_id=o.id AND c.operation IN ('REAUTHORIZE_AUTHORIZATION','CAPTURE_AUTHORIZATION','VOID_AUTHORIZATION'))
            ORDER BY (p.plan_json::jsonb->'intent'->>'eventAt')::timestamptz
            LIMIT 10
            """,(r,n)->DbJson.read(r.getString(1),Plan.class));
    }
    /** The organizer cancels: nothing more can be paid, and the voids and refunds that follow go through AgentSafe. */
    public void cancel(Plan plan) {
        transaction(() -> { lock(plan.id()); db.update("UPDATE commerce.plans SET payment_frozen=true WHERE id=?",plan.id());
            appendInside(plan.id(),"PLAN_CANCELLED","You cancelled the event. SwarmPay voids the catering hold and refunds what was paid, each through AgentSafe.","HUMAN"); return null; });
        releaseIfSettled(plan.id());
    }
    /** Recover a crash between recording cancellation and enqueuing its protective settlements. */
    public List<Plan> pendingCancellations() {
        return db.query("""
            SELECT p.plan_json FROM commerce.plans p WHERE p.payment_frozen=true
              AND EXISTS (SELECT 1 FROM commerce.events e WHERE e.workflow_id=p.id AND e.type='PLAN_CANCELLED')
              AND EXISTS (SELECT 1 FROM commerce.orders o WHERE o.workflow_id=p.id
                AND ((o.merchant_id='catering' AND o.status='AUTHORIZED' AND NOT EXISTS
                  (SELECT 1 FROM commerce.commands c WHERE c.order_id=o.id AND c.operation='VOID_AUTHORIZATION'))
                OR (o.merchant_id='tents' AND o.status='CAPTURED' AND NOT EXISTS
                  (SELECT 1 FROM commerce.commands c WHERE c.order_id=o.id AND c.operation='REFUND_CAPTURE'))))
            ORDER BY p.created_at LIMIT 10
            """,(r,n)->DbJson.read(r.getString(1),Plan.class));
    }
    /** Releases the plan's budget once nothing is held, being paid or paid; called inside or outside a transaction. */
    private void releaseIfSettled(UUID workflowId) {
        transaction(() -> {
            lock(workflowId);
            Integer open = db.queryForObject("""
                SELECT count(*) FROM commerce.orders o WHERE o.workflow_id=? AND
                  (o.status IN ('AUTHORIZED','CAPTURED','PENDING') OR EXISTS (
                    SELECT 1 FROM commerce.commands c WHERE c.order_id=o.id
                    AND (c.state IN ('QUEUED','DISPATCHING','INDETERMINATE','EXECUTION_INDETERMINATE')
                      OR c.result_json::jsonb->'result'->>'status'='PENDING')))
                """, Integer.class, workflowId);
            if (open != null && open == 0 && frozen(workflowId)
                && db.update("UPDATE commerce.reservations SET state='RELEASED' WHERE workflow_id=? AND state='ACTIVE'", workflowId) > 0)
                appendInside(workflowId,"BUDGET_RELEASED","Nothing is held or paid for this plan any more, so its budget reservation was released.","APPLICATION");
            return null;
        });
    }
    public void freeze(Plan plan) {
        transaction(() -> { lock(plan.id()); db.update("UPDATE commerce.plans SET payment_frozen=true WHERE id=?",plan.id());
            appendInside(plan.id(),"PAYMENTS_FROZEN","Further automatic payments are frozen for a delivery dispute. Already dispatched payments need provider review.","HUMAN"); return null; });
    }
    public boolean frozen(UUID id) { return Boolean.TRUE.equals(db.queryForObject("SELECT payment_frozen FROM commerce.plans WHERE id=?",Boolean.class,id)); }
    public String commandState(UUID id) { return db.queryForObject("SELECT state FROM commerce.commands WHERE id=?", String.class, id); }
    public GateResult commandResult(UUID id) {
        var result = db.queryForObject("SELECT result_json FROM commerce.commands WHERE id=?", String.class, id);
        return result == null ? null : DbJson.read(result, GateResult.class);
    }
    public PaymentCommand command(UUID id, String owner) {
        var results = db.query("SELECT c.command_json FROM commerce.commands c JOIN commerce.plans p ON p.id=c.workflow_id WHERE c.id=? AND p.owner_id=?", (r,n) -> DbJson.read(r.getString(1), PaymentCommand.class), id, owner);
        if (results.isEmpty()) throw new CommerceException("NOT_FOUND", "Payment command not found", 404);
        return results.getFirst();
    }
    public void finish(PaymentCommand command, GateResult result) {
        transaction(() -> {
            lock(command.workflowId());
            var prior = commandResult(command.id());
            if (prior != null && prior.equals(result)) { touch(command.id()); return null; }
            // A late reconciliation response must not rewind a completed command in the ledger either.
            if (providerSettled(prior)) { touch(command.id()); return null; }
            db.update("""
                UPDATE commerce.commands SET state=?,result_json=?,updated_at=now(),
                  settled_at=CASE WHEN ? THEN COALESCE(settled_at,now()) ELSE settled_at END,
                  first_exception_at=CASE WHEN ? THEN COALESCE(first_exception_at,now()) ELSE first_exception_at END WHERE id=?
                """,result.state(),DbJson.write(result),providerSettled(result),!providerSettled(result),command.id());
            if (result.result() != null) {
                var p = result.result();
                int rank = switch (p.status()) {
                    case "APPROVAL_REQUIRED" -> 1;
                    case "PENDING" -> Set.of(Operation.CAPTURE_AUTHORIZATION,Operation.VOID_AUTHORIZATION,Operation.REAUTHORIZE_AUTHORIZATION).contains(command.operation()) ? 4 : 2;
                    case "AUTHORIZED" -> 3;
                    case "CAPTURED", "VOIDED", "DECLINED", "EXPIRED" -> 5;
                    case "REFUNDED" -> 6;
                    default -> throw new IllegalArgumentException("Unsupported provider payment status");
                };
                // Settled states are final, except that a captured payment can later be refunded.
                db.update("""
                    UPDATE commerce.orders SET status=?,projection_rank=?,provider_order_id=COALESCE(?,provider_order_id),
                    authorization_id=COALESCE(?,authorization_id),capture_id=COALESCE(?,capture_id) WHERE id=?
                    AND projection_rank<=?
                    AND (status NOT IN ('CAPTURED','VOIDED','DECLINED','EXPIRED','REFUNDED') OR status=? OR (status='CAPTURED' AND ?='REFUNDED'))
                    """, p.status(),rank,p.providerOrderId(),p.authorizationId(),p.captureId(),command.orderId(),rank,p.status(),p.status());
            }
            // A reconciled non-dispatch or declined payment can also clear the last uncertainty after cancellation.
            releaseIfSettled(command.workflowId());
            String status = result.result() == null ? null : result.result().status();
            String message = command.operation() == Operation.REAUTHORIZE_AUTHORIZATION && "AUTHORIZED".equals(status)
                ? "PayPal renewed the catering hold: a new authorization with a fresh 3-day honor period covers the delivery. No money moved."
                : command.operation() == Operation.REFUND_CAPTURE && "REFUNDED".equals(status)
                ? "PayPal refunded the $" + Money.usd(command.amountMinor()).decimal() + " tents payment to you."
                : result.message();
            appendInside(command.workflowId(), "PAYMENT_" + result.state(), message, result.dossierId() == null ? "APPLICATION" : "AGENTSAFE");
            return null;
        });
    }
    private static boolean providerSettled(GateResult result) {
        return result!=null && "SUCCEEDED".equals(result.state()) && result.result()!=null && !"PENDING".equals(result.result().status());
    }
    public void recordAgentRequest(PaymentCommand request, GateResult result, String type) {
        transaction(() -> {
            lock(request.workflowId());
            db.update("INSERT INTO commerce.agent_requests(id,workflow_id,command_json,result_json) VALUES (?,?,?,?)",
                request.id(), request.workflowId(), DbJson.write(request), DbJson.write(result));
            appendInside(request.workflowId(), type, result.message(), result.dossierId() == null ? "APPLICATION" : "AGENTSAFE");
            return null;
        });
    }
    /** Every payment command and agent request across the organizer's plans, newest first. */
    public List<LedgerEntry> ledger(String owner) {
        return ledger(owner,null);
    }
    public List<LedgerEntry> ledger(String owner,UUID workflowId) {
        var entries = new ArrayList<LedgerEntry>();
        db.query("""
            SELECT c.id,c.created_at,c.state,c.command_json,c.result_json,p.plan_json,COALESCE(c.settled_at,c.updated_at) FROM commerce.commands c
            JOIN commerce.plans p ON p.id=c.workflow_id WHERE p.owner_id=? AND (?::uuid IS NULL OR p.id=?::uuid) ORDER BY c.created_at DESC LIMIT 500
            """, (org.springframework.jdbc.core.RowCallbackHandler) r -> {
            var command = DbJson.read(r.getString(4), PaymentCommand.class);
            var result = r.getString(5) == null ? null : DbJson.read(r.getString(5), GateResult.class);
            // The catering capture after a verified receipt and the hold's renewal are SwarmPay's; every other command follows the organizer's action.
            entries.add(entry(r.getObject(1, UUID.class), r.getTimestamp(2).toInstant(), r.getTimestamp(7).toInstant(), DbJson.read(r.getString(6), Plan.class), command,
                Set.of(Operation.CAPTURE_AUTHORIZATION,Operation.REAUTHORIZE_AUTHORIZATION).contains(command.operation()) ? "SWARMPAY" : "ORGANIZER", r.getString(3), result));
        }, owner,workflowId,workflowId);
        db.query("""
            SELECT a.id,a.created_at,a.command_json,a.result_json,p.plan_json FROM commerce.agent_requests a
            JOIN commerce.plans p ON p.id=a.workflow_id WHERE p.owner_id=? AND (?::uuid IS NULL OR p.id=?::uuid) ORDER BY a.created_at DESC LIMIT 500
            """, (org.springframework.jdbc.core.RowCallbackHandler) r -> {
            var result = DbJson.read(r.getString(4), GateResult.class);
            entries.add(entry(r.getObject(1, UUID.class), r.getTimestamp(2).toInstant(), r.getTimestamp(2).toInstant(), DbJson.read(r.getString(5), Plan.class),
                DbJson.read(r.getString(3), PaymentCommand.class), "AGENT", result.state(), result));
        }, owner,workflowId,workflowId);
        entries.sort(Comparator.comparing(LedgerEntry::at).reversed());
        return entries;
    }
    private static LedgerEntry entry(UUID id, Instant at, Instant settledAt, Plan plan, PaymentCommand command, String requestedBy, String state, GateResult result) {
        var line = plan.lines().stream().filter(l -> l.id().equals(command.orderId())).findFirst().orElseThrow();
        var provider = result == null ? null : result.result();
        return new LedgerEntry(id, at, settledAt, plan.id(), plan.intent().venue(), plan.intent().eventAt(), line.merchantName(), line.category(),
            command.operation(), requestedBy, command.amountMinor(), state, result == null ? null : result.execution(),
            result == null ? null : result.message(), result == null ? null : result.dossierId(),
            provider == null ? null : provider.providerOrderId(), provider == null ? null : provider.authorizationId(), provider == null ? null : provider.captureId(),
            provider == null ? null : provider.refundId(), provider == null ? null : provider.status());
    }
    public List<AgentRequest> agentRequests(UUID workflowId) {
        return db.query("SELECT command_json,result_json,created_at FROM commerce.agent_requests WHERE workflow_id=? ORDER BY created_at", (r,n) ->
            new AgentRequest(DbJson.read(r.getString(1), PaymentCommand.class), DbJson.read(r.getString(2), GateResult.class), r.getTimestamp(3).toInstant()), workflowId);
    }
    public void evidence(UUID workflowId, String type, String message, String source) {
        transaction(() -> { lock(workflowId); appendInside(workflowId,type,message,source); return null; });
    }
    public void saveReceipt(Plan plan, Receipt receipt, SignedReceipt signed, String digest) {
        transaction(() -> {
            lock(plan.id());
            var same = db.query("SELECT digest FROM commerce.receipts WHERE issuer=? AND nonce=?", (r,n) -> r.getString(1), receipt.issuer(), receipt.nonce());
            if (!same.isEmpty()) {
                if (same.getFirst().equals(digest)) return null;
                throw CommerceException.held("Receipt nonce has already been used");
            }
            db.update("INSERT INTO commerce.receipts(workflow_id,order_id,issuer,nonce,digest,envelope_json) VALUES (?,?,?,?,?,?)", plan.id(), receipt.orderId(), receipt.issuer(), receipt.nonce(), digest, DbJson.write(signed));
            appendInside(plan.id(), "RECEIPT_VERIFIED", "The receipt matches the seller, venue, quantity and delivery window.", receipt.issuer());
            return null;
        });
    }
    public String receiptDigest(UUID orderId) {
        var hashes = db.query("SELECT digest FROM commerce.receipts WHERE order_id=? ORDER BY created_at DESC LIMIT 1", (r,n) -> r.getString(1), orderId);
        return hashes.isEmpty() ? null : hashes.getFirst();
    }
    public SignedReceipt signedReceipt(UUID orderId, String digest) {
        var results = db.query("SELECT envelope_json FROM commerce.receipts WHERE order_id=? AND digest=?", (r,n) -> DbJson.read(r.getString(1), SignedReceipt.class), orderId, digest);
        if (results.isEmpty()) throw CommerceException.held("No verified delivery receipt is attached");
        return results.getFirst();
    }
    public void savePhoto(Plan plan, byte[] bytes, String mime, String digest) {
        transaction(() -> {
            lock(plan.id());
            db.update("INSERT INTO commerce.photos(id,workflow_id,mime,digest,content) VALUES (?,?,?,?,?)", UUID.randomUUID(),plan.id(),mime,digest,bytes);
            appendInside(plan.id(), "EVIDENCE_HELD", "Photo received. A trusted delivery receipt is still required before payment.", "PHOTO");
            return null;
        });
    }
    public List<Event> events(UUID id) {
        return db.query("SELECT * FROM commerce.events WHERE workflow_id=? ORDER BY sequence", (r,n) ->
            new Event(r.getLong("sequence"), r.getString("type"), r.getString("message"), r.getString("source"), r.getTimestamp("created_at").toInstant(),r.getString("previous_hash"),r.getString("hash")), id);
    }
    public boolean verifyChain(UUID id) {
        String previous="GENESIS"; long next=1;
        for (var event:events(id)) {
            String hash=sha256(id+"\n"+event.sequence()+"\n"+event.type()+"\n"+event.message()+"\n"+event.source()+"\n"+event.at()+"\n"+previous);
            if (event.sequence()!=next++ || !previous.equals(event.previousHash()) || !hash.equals(event.hash())) return false;
            previous=hash;
        }
        return true;
    }
    private void lock(UUID id) {
        var rows = db.query("SELECT id FROM commerce.plans WHERE id=? FOR UPDATE", (r,n) -> r.getObject(1), id);
        if (rows.isEmpty()) throw new CommerceException("NOT_FOUND", "Plan not found", 404);
    }
    private void appendInside(UUID id, String type, String message, String source) {
        var previous = db.query("SELECT sequence,hash FROM commerce.events WHERE workflow_id=? ORDER BY sequence DESC LIMIT 1", (r,n) -> Map.entry(r.getLong(1),r.getString(2)), id);
        long sequence = previous.isEmpty() ? 1 : previous.getFirst().getKey()+1;
        String last = previous.isEmpty() ? "GENESIS" : previous.getFirst().getValue();
        Instant at = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        String hash = sha256(id+"\n"+sequence+"\n"+type+"\n"+message+"\n"+source+"\n"+at+"\n"+last);
        db.update("INSERT INTO commerce.events(workflow_id,sequence,type,message,source,created_at,previous_hash,hash) VALUES (?,?,?,?,?,?,?,?)",id,sequence,type,message,source,java.sql.Timestamp.from(at),last,hash);
    }
    public static String sha256(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
}
