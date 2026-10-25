package com.swarmpay.persistence;

import com.swarmpay.domain.*;
import com.swarmpay.domain.Commerce.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@Testcontainers
class CommerceRepositoryTest {
    @Container static final PostgreSQLContainer<?> postgres=new PostgreSQLContainer<>("postgres:17.6");
    static DriverManagerDataSource source;
    static CommerceRepository repository;
    static JdbcTemplate sql;
    final PlanFactory factory=new PlanFactory(Clock.systemUTC());
    @BeforeAll static void schema() throws Exception {
        source=new DriverManagerDataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword());
        sql=new JdbcTemplate(source);repository=new CommerceRepository(source);
        try(var connection=source.getConnection();var statement=connection.createStatement()) {
            statement.execute("CREATE SCHEMA commerce");connection.setSchema("commerce");
            statement.execute(Files.readString(Path.of("../../apps/commerce-app/src/main/resources/db/commerce/V1__commerce.sql")));
            statement.execute(Files.readString(Path.of("../../apps/commerce-app/src/main/resources/db/commerce/V2__runtime_binding.sql")));
            statement.execute(Files.readString(Path.of("../../apps/commerce-app/src/main/resources/db/commerce/V3__monotonic_order_projection.sql")));
        }
    }
    Plan plan(long budget) {
        return factory.create("organizer",new Intent("Meetup",30,5,budget,Instant.now().plusSeconds(3600),"UTC","Pavilion","Rain","RENT"),
            new Offer("tents","tents","Tents",Category.TENTS,"Tent","",10000,10,""),new Offer("catering","catering","Kitchen",Category.CATERING,"Meal","",3000,100,""),List.of());
    }
    @Test void racingApprovalsReserveExactlyOneWholeBudget() throws Exception {
        var plan=plan(150000);repository.create(plan);
        try(var pool=Executors.newFixedThreadPool(8)) {
            var futures=new ArrayList<Future<Plan>>();
            for(int i=0;i<16;i++) futures.add(pool.submit(()->repository.approve(plan.id(),"organizer",1,factory)));
            for(var future:futures) assertEquals("APPROVED",future.get(10,TimeUnit.SECONDS).status());
        }
        assertEquals(1,sql.queryForObject("SELECT count(*) FROM commerce.reservations WHERE workflow_id=?",Integer.class,plan.id()));
        assertEquals(140000,sql.queryForObject("SELECT amount_minor FROM commerce.reservations WHERE workflow_id=?",Long.class,plan.id()));
        assertTrue(repository.verifyChain(plan.id()));
    }
    @Test void budgetAndOwnershipAreCheckedBeforeAnyCommitment() {
        var plan=plan(130000);repository.create(plan);
        assertEquals("BUDGET_EXCEEDED",assertThrows(CommerceException.class,()->repository.approve(plan.id(),"organizer",1,factory)).code());
        assertThrows(CommerceException.class,()->repository.approve(plan.id(),"another-owner",1,factory));
        assertEquals(0,sql.queryForObject("SELECT count(*) FROM commerce.reservations WHERE workflow_id=?",Integer.class,plan.id()));
    }
    @Test void racingDuplicateCommandsKeepOneBusinessIdentityAndRejectChangedAmounts() throws Exception {
        var plan=plan(150000);repository.create(plan);repository.approve(plan.id(),"organizer",1,factory);var line=plan.lines().getFirst();
        try(var pool=Executors.newFixedThreadPool(4)) {
            var futures=new ArrayList<Future<PaymentCommand>>();
            for(int i=0;i<12;i++)futures.add(pool.submit(()->repository.enqueue(command(plan,line,50000))));
            var ids=new HashSet<UUID>();for(var future:futures)ids.add(future.get(10,TimeUnit.SECONDS).id());assertEquals(1,ids.size());
        }
        assertThrows(CommerceException.class,()->repository.enqueue(command(plan,line,50001)));
    }
    @Test void auditAlterationIsDetectedAndLateCreateCannotRewindCapturedStatus() {
        var plan=plan(150000);repository.create(plan);repository.approve(plan.id(),"organizer",1,factory);var line=plan.lines().getFirst();
        var command=repository.enqueue(command(plan,line,50000));
        repository.finish(command,new GateResult("SUCCEEDED","FORWARDED","decision","dossier","a".repeat(64),null,"Captured",new ProviderResult("CAPTURED","order",null,"capture",null,50000,"USD","tents","TEST")));
        repository.finish(command,new GateResult("SUCCEEDED","FORWARDED","decision","dossier","a".repeat(64),null,"Late create",new ProviderResult("APPROVAL_REQUIRED","order",null,null,null,50000,"USD","tents","TEST")));
        assertEquals("CAPTURED",repository.order(plan,line.id()).status());assertTrue(repository.verifyChain(plan.id()));
        sql.update("UPDATE commerce.events SET message='changed' WHERE workflow_id=? AND sequence=1",plan.id());assertFalse(repository.verifyChain(plan.id()));
    }
    @Test void unknownOutcomesCannotBeRetriedAndSafeRetriesPreserveIdentity() {
        var plan=plan(150000);repository.create(plan);repository.approve(plan.id(),"organizer",1,factory);
        var command=repository.enqueue(command(plan,plan.lines().getFirst(),50000));
        repository.finish(command,new GateResult("INDETERMINATE","INDETERMINATE",null,null,null,null,"Unknown",null));
        assertThrows(CommerceException.class,()->repository.retryNotForwarded(command));
        repository.finish(command,new GateResult("NOT_EXECUTED","NOT_FORWARDED",null,null,null,null,"No provider attempt",null));
        repository.retryNotForwarded(command);assertTrue(repository.claim(command.id()));assertFalse(repository.claim(command.id()));
        assertEquals(command,repository.commandsFor(plan).getFirst());
    }
    @Test void outOfOrderRepliesCannotRewindAuthorizationOrPendingCapture() {
        var plan=plan(150000);repository.create(plan);repository.approve(plan.id(),"organizer",1,factory);
        var line=plan.lines().get(1);
        var create=repository.enqueue(new PaymentCommand(UUID.randomUUID(),plan.id(),1,line.id(),Operation.CREATE_ORDER,"catering",90000,"USD",null,null,plan.id().toString(),"test-v1"));
        var authorize=repository.enqueue(new PaymentCommand(UUID.randomUUID(),plan.id(),1,line.id(),Operation.AUTHORIZE_ORDER,"catering",90000,"USD","order",null,plan.id().toString(),"test-v1"));
        var capture=repository.enqueue(new PaymentCommand(UUID.randomUUID(),plan.id(),1,line.id(),Operation.CAPTURE_AUTHORIZATION,"catering",90000,"USD","auth","receipt",plan.id().toString(),"test-v1"));
        var authorized=new GateResult("SUCCEEDED","FORWARDED","decision","dossier","hash",null,"Authorized",new ProviderResult("AUTHORIZED","order","auth",null,null,90000,"USD","catering","TEST"));
        repository.finish(authorize,authorized);
        repository.finish(create,new GateResult("SUCCEEDED","FORWARDED","decision","dossier","hash",null,"Late checkout",new ProviderResult("APPROVAL_REQUIRED","order",null,null,null,90000,"USD","catering","TEST")));
        assertEquals("AUTHORIZED",repository.order(plan,line.id()).status());
        repository.finish(capture,new GateResult("SUCCEEDED","FORWARDED","decision","dossier","hash",null,"Pending capture",new ProviderResult("PENDING","order","auth","capture",null,90000,"USD","catering","TEST")));
        repository.finish(authorize,new GateResult("SUCCEEDED","FORWARDED","later-decision","dossier","hash",null,"Late authorization",authorized.result()));
        assertEquals("PENDING",repository.order(plan,line.id()).status());
        repository.finish(capture,new GateResult("SUCCEEDED","FORWARDED","decision","dossier","hash",null,"Captured",new ProviderResult("CAPTURED","order","auth","capture",null,90000,"USD","catering","TEST")));
        assertEquals("CAPTURED",repository.order(plan,line.id()).status());
    }
    @Test void aDemoLedgerCannotBeRelabelledAsSandbox() {
        RuntimeBinding.verify(source,"commerce","demo");
        RuntimeBinding.verify(source,"commerce","demo");
        assertThrows(IllegalStateException.class,()->RuntimeBinding.verify(source,"commerce","sandbox"));
    }
    @Test void aDisputeFreezePreventsSpendingButPreservesConsentForAProtectiveVoid() {
        var plan=plan(150000);repository.create(plan);
        assertThrows(CommerceException.class,()->repository.approvedForVoid(plan.id()));
        repository.approve(plan.id(),"organizer",1,factory);repository.freeze(plan);
        assertThrows(CommerceException.class,()->repository.approvedForExecution(plan.id()));
        assertEquals(plan.id(),repository.approvedForVoid(plan.id()).id());
        assertTrue(repository.frozen(plan.id()));
    }
    PaymentCommand command(Plan plan,Line line,long amount) {return new PaymentCommand(UUID.randomUUID(),plan.id(),1,line.id(),Operation.CREATE_ORDER,"tents",amount,"USD",null,null,plan.id().toString(),"test-v1");}
}
