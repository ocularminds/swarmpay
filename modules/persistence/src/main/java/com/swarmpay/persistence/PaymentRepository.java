package com.swarmpay.persistence;

import com.swarmpay.domain.Commerce.*;
import com.swarmpay.domain.CommerceException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import javax.sql.DataSource;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;

public final class PaymentRepository {
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    public PaymentRepository(DataSource source) { db = new JdbcTemplate(source); tx=new TransactionTemplate(new DataSourceTransactionManager(source)); }
    public <T> T transaction(Supplier<T> work) { return tx.execute(s -> work.get()); }
    public void lockOrder(UUID order) { db.execute((org.springframework.jdbc.core.ConnectionCallback<Void>) connection -> {
        try (var statement=connection.prepareStatement("SELECT pg_advisory_xact_lock(hashtextextended(?,0))")) { statement.setString(1,order.toString()); statement.execute(); } return null;
    }); }
    public boolean hasUnresolved(UUID order) {
        return Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM payments.attempts WHERE order_id=? AND state IN ('DISPATCHING','INDETERMINATE'))",Boolean.class,order));
    }
    /** Records a new attempt, or re-admits one that never reached a payment effect under its fresh authority decision. */
    public boolean begin(PaymentCommand command, String intentHash, String dossierId) {
        return db.update("""
            INSERT INTO payments.attempts(id,workflow_id,order_id,operation,command_json,command_hash,intent_hash,dossier_id,state)
            VALUES (?,?,?,?,?,?,?,?,'DISPATCHING') ON CONFLICT(id) DO UPDATE
              SET state='DISPATCHING',intent_hash=EXCLUDED.intent_hash,dossier_id=EXCLUDED.dossier_id,updated_at=now()
              WHERE attempts.state='NOT_DISPATCHED' AND attempts.command_hash=EXCLUDED.command_hash
            """,command.id(),command.workflowId(),command.orderId(),command.operation().name(),DbJson.write(command),
            CommerceRepository.sha256(DbJson.write(command)),intentHash,dossierId) == 1;
    }
    public void checkSame(PaymentCommand command) {
        String stored = db.queryForObject("SELECT command_hash FROM payments.attempts WHERE id=?", String.class, command.id());
        if (!CommerceRepository.sha256(DbJson.write(command)).equals(stored)) throw CommerceException.conflict("A payment identity cannot be reused for a changed command");
    }
    public void complete(UUID id, ProviderResult result) {
        db.update("UPDATE payments.attempts SET state='COMPLETED',result_json=?,updated_at=now() WHERE id=?",DbJson.write(result),id);
    }
    public void uncertain(UUID id) { db.update("UPDATE payments.attempts SET state='INDETERMINATE',updated_at=now() WHERE id=?",id); }
    public void fail(UUID id) { db.update("UPDATE payments.attempts SET state='FAILED',updated_at=now() WHERE id=?",id); }
    public void notDispatched(UUID id) { db.update("UPDATE payments.attempts SET state='NOT_DISPATCHED',updated_at=now() WHERE id=?",id); }
    public ProviderResult result(UUID id) {
        var results = db.query("SELECT result_json FROM payments.attempts WHERE id=? AND state='COMPLETED'",(r,n) -> DbJson.read(r.getString(1),ProviderResult.class),id);
        return results.isEmpty() ? null : results.getFirst();
    }
    public ProviderResult latest(UUID orderId) {
        var results=db.query("SELECT result_json FROM payments.attempts WHERE order_id=? AND state='COMPLETED' ORDER BY updated_at DESC LIMIT 1",(r,n)->DbJson.read(r.getString(1),ProviderResult.class),orderId);
        return results.isEmpty()?null:results.getFirst();
    }
    public PaymentCommand command(UUID id) {
        var results=db.query("SELECT command_json FROM payments.attempts WHERE id=?",(r,n)->DbJson.read(r.getString(1),PaymentCommand.class),id);
        return results.isEmpty()?null:results.getFirst();
    }
    public String state(UUID id) {
        var states=db.query("SELECT state FROM payments.attempts WHERE id=?",(r,n)->r.getString(1),id);
        return states.isEmpty()?"NOT_EXECUTED":states.getFirst();
    }
    public boolean addWebhook(String id, String merchant, String json) {
        return db.update("INSERT INTO payments.webhooks(id,merchant_id,event_json) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING",id,merchant,json)==1;
    }
    public GateResult evidence(UUID id) {
        var rows=db.query("SELECT intent_hash,dossier_id FROM payments.attempts WHERE id=?",(r,n)->
            new GateResult(state(id),"INDETERMINATE",null,r.getString(2),r.getString(1),null,"Provider reconciliation required.",null),id);
        return rows.isEmpty()?null:rows.getFirst();
    }
    public List<PaymentCommand> commandsForResource(String merchant,String resource) {
        return db.query("""
            SELECT a.command_json FROM payments.attempts a WHERE a.command_json::jsonb->>'merchantId'=?
             AND (a.command_json::jsonb->>'providerResourceId'=? OR a.order_id IN
                (SELECT order_id FROM payments.attempts WHERE result_json::jsonb->>'providerOrderId'=?
                  OR result_json::jsonb->>'authorizationId'=? OR result_json::jsonb->>'captureId'=?))
            """,(r,n)->DbJson.read(r.getString(1),PaymentCommand.class),merchant,resource,resource,resource,resource);
    }
}
