package com.swarmpay.persistence;

import com.swarmpay.domain.Commerce.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;
import java.nio.file.*;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@Testcontainers
class PaymentRepositoryTest {
    @Container static final PostgreSQLContainer<?> postgres=new PostgreSQLContainer<>("postgres:17.6");
    static PaymentRepository payments;
    static JdbcTemplate sql;
    @BeforeAll static void schema() throws Exception {
        var source=new DriverManagerDataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword());
        sql=new JdbcTemplate(source);payments=new PaymentRepository(source);
        try(var connection=source.getConnection();var statement=connection.createStatement()) {
            statement.execute("CREATE SCHEMA payments");connection.setSchema("payments");
            for(String migration:new String[]{"V1__payments.sql","V3__buyer_reapproval.sql"})
                statement.execute(Files.readString(Path.of("../../apps/payment-executor/src/main/resources/db/payments/"+migration)));
        }
    }
    PaymentCommand command(UUID id,long amount) {
        var workflow=UUID.randomUUID();
        return new PaymentCommand(id,workflow,1,UUID.randomUUID(),Operation.CREATE_ORDER,"tents",amount,"USD",null,null,workflow.toString(),"test-v1");
    }
    @Test void onlyANotDispatchedAttemptIsReadmittedAndOnlyForTheSameCommand() {
        var c=command(UUID.randomUUID(),50000);
        assertTrue(payments.begin(c,"hash-1","dossier-1"));
        assertFalse(payments.begin(c,"hash-2","dossier-2"),"an attempt in flight is never dispatched twice");

        payments.notDispatched(c.id());
        assertEquals("NOT_DISPATCHED",payments.state(c.id()));
        var changed=new PaymentCommand(c.id(),c.workflowId(),1,c.orderId(),c.operation(),c.merchantId(),50001,"USD",null,null,c.reservationId(),"test-v1");
        assertFalse(payments.begin(changed,"hash-2","dossier-2"),"a changed command cannot reuse the identity");
        assertEquals("NOT_DISPATCHED",payments.state(c.id()));

        assertTrue(payments.begin(c,"hash-2","dossier-2"));
        assertEquals("DISPATCHING",payments.state(c.id()));
        assertEquals("dossier-2",payments.evidence(c.id()).dossierId());
        assertEquals(1,sql.queryForObject("SELECT count(*) FROM payments.attempts WHERE id=?",Integer.class,c.id()));

        payments.complete(c.id(),new ProviderResult("APPROVAL_REQUIRED","order",null,null,null,50000,"USD","tents","TEST"));
        assertFalse(payments.begin(c,"hash-3","dossier-3"));
    }
    @Test void aDeclinedBuyerStepIsReadmittedWithACountedAttemptButAFailedOneIsNot() {
        var c=command(UUID.randomUUID(),50000);
        assertTrue(payments.begin(c,"hash-1","dossier-1"));
        assertEquals(0,payments.buyerAttempts(c.id()));
        payments.buyerActionRequired(c.id());
        assertTrue(payments.begin(c,"hash-2","dossier-2"));
        assertEquals(1,payments.buyerAttempts(c.id()));
        // PayPal unreachable on the retry: re-admitted under the same counted attempt.
        payments.notDispatched(c.id());
        assertTrue(payments.begin(c,"hash-3","dossier-3"));
        assertEquals(1,payments.buyerAttempts(c.id()));
        payments.fail(c.id());
        assertFalse(payments.begin(c,"hash-4","dossier-4"),"a refused attempt is final");
        assertEquals(0,payments.buyerAttempts(UUID.randomUUID()));
    }
}
