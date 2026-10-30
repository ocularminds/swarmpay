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
            statement.execute(Files.readString(Path.of("../../apps/commerce-app/src/main/resources/db/commerce/V4__agent_requests.sql")));
            statement.execute(Files.readString(Path.of("../../apps/commerce-app/src/main/resources/db/commerce/V5__organizer_accounts.sql")));
            statement.execute(Files.readString(Path.of("../../apps/commerce-app/src/main/resources/db/commerce/V6__agent_tokens.sql")));
            statement.execute(Files.readString(Path.of("../../apps/commerce-app/src/main/resources/db/commerce/V7__refunded_orders.sql")));
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
    @Test void onlyANewBuyerApprovalRequeuesADeclinedFundingSource() {
        var plan=plan(150000);repository.create(plan);repository.approve(plan.id(),"organizer",1,factory);
        var line=plan.lines().getFirst();
        var capture=repository.enqueue(new PaymentCommand(UUID.randomUUID(),plan.id(),1,line.id(),Operation.CAPTURE_ORDER,"tents",50000,"USD","order",null,plan.id().toString(),"test-v1"));
        assertTrue(repository.claim(capture.id()));
        repository.finish(capture,new GateResult("BUYER_ACTION_REQUIRED","NOT_FORWARDED",null,"dossier","hash",null,"Declined",null));
        // The generic retry cannot resend a declined funding source; the buyer must choose another first.
        assertThrows(CommerceException.class,()->repository.retryNotForwarded(capture));
        repository.requeueAfterBuyerAction(plan.id(),line.id(),Operation.CAPTURE_AUTHORIZATION);
        assertEquals("BUYER_ACTION_REQUIRED",repository.commandState(capture.id()));
        repository.requeueAfterBuyerAction(plan.id(),line.id(),Operation.CAPTURE_ORDER);
        assertEquals("QUEUED",repository.commandState(capture.id()));assertNull(repository.commandResult(capture.id()));
        assertTrue(repository.claim(capture.id()));
        repository.requeueAfterBuyerAction(plan.id(),line.id(),Operation.CAPTURE_ORDER);
        assertEquals("DISPATCHING",repository.commandState(capture.id()),"an attempt in flight is never requeued");
        assertEquals(1,repository.events(plan.id()).stream().filter(e->e.type().equals("BUYER_REAPPROVED")).count());
        assertTrue(repository.verifyChain(plan.id()));
    }
    @Test void anAgentRequestTheAuthorityHeldIsRecordedButNeverQueued() {
        var plan=plan(150000);repository.create(plan);repository.approve(plan.id(),"organizer",1,factory);
        var line=plan.lines().get(1);
        var request=new PaymentCommand(UUID.randomUUID(),plan.id(),1,line.id(),Operation.CAPTURE_AUTHORIZATION,"catering",90000,"USD","auth",null,plan.id().toString(),"test-v1");
        repository.recordAgentRequest(request,new GateResult("ESCALATE","HELD","decision","dossier","sha256:hash","intent","Held for review.",null),"AGENT_REQUEST_ESCALATE");
        var recorded=repository.agentRequests(plan.id());
        assertEquals(1,recorded.size());assertEquals(request,recorded.getFirst().command());assertEquals("dossier",recorded.getFirst().result().dossierId());
        assertTrue(repository.queued().stream().noneMatch(c->c.id().equals(request.id())));
        assertFalse(repository.recordedCommandMatches(request),"the executor finds no outbox command for it");
        assertTrue(repository.commandsFor(plan).isEmpty());
        var event=repository.events(plan.id()).getLast();
        assertEquals("AGENT_REQUEST_ESCALATE",event.type());assertEquals("AGENTSAFE",event.source());
        assertTrue(repository.verifyChain(plan.id()));
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
    @Test void aCancelledEventIsRefundedVoidedAndReleasesItsBudgetOnlyOnceNothingIsHeld() {
        var plan=plan(150000);repository.create(plan);repository.approve(plan.id(),"organizer",1,factory);
        var tents=plan.lines().getFirst(); var catering=plan.lines().get(1);
        var capture=repository.enqueue(new PaymentCommand(UUID.randomUUID(),plan.id(),1,tents.id(),Operation.CAPTURE_ORDER,"tents",50000,"USD","order-t",null,plan.id().toString(),"test-v1"));
        repository.finish(capture,succeeded(new ProviderResult("CAPTURED","order-t",null,"capture",null,50000,"USD","tents","TEST")));
        var authorize=repository.enqueue(new PaymentCommand(UUID.randomUUID(),plan.id(),1,catering.id(),Operation.AUTHORIZE_ORDER,"catering",90000,"USD","order-c",null,plan.id().toString(),"test-v1"));
        repository.finish(authorize,succeeded(new ProviderResult("AUTHORIZED","order-c","auth",null,null,90000,"USD","catering","TEST")));
        repository.cancel(plan);
        assertTrue(repository.frozen(plan.id()));
        assertThrows(CommerceException.class,()->repository.approvedForExecution(plan.id()));
        var voided=repository.enqueue(new PaymentCommand(UUID.randomUUID(),plan.id(),1,catering.id(),Operation.VOID_AUTHORIZATION,"catering",90000,"USD","auth",null,plan.id().toString(),"test-v1"));
        repository.finish(voided,succeeded(new ProviderResult("VOIDED","order-c","auth",null,null,90000,"USD","catering","TEST")));
        // The tents are still paid, so the budget stays reserved.
        assertTrue(repository.reservationMatches(voided,plan));
        var refund=repository.enqueue(new PaymentCommand(UUID.randomUUID(),plan.id(),1,tents.id(),Operation.REFUND_CAPTURE,"tents",50000,"USD","capture",null,plan.id().toString(),"test-v1"));
        repository.finish(refund,succeeded(new ProviderResult("REFUNDED","order-t",null,"capture",null,50000,"USD","tents","TEST","refund")));
        var orders=repository.orders(plan);
        assertEquals("REFUNDED",orders.stream().filter(o->o.category()==Category.TENTS).findFirst().orElseThrow().status());
        assertEquals("VOIDED",orders.stream().filter(o->o.category()==Category.CATERING).findFirst().orElseThrow().status());
        assertFalse(repository.reservationMatches(refund,plan));
        assertEquals("RELEASED",sql.queryForObject("SELECT state FROM commerce.reservations WHERE workflow_id=?",String.class,plan.id()));
        // A late capture reply cannot turn a refund back into a payment.
        repository.finish(capture,succeeded(new ProviderResult("CAPTURED","order-t",null,"capture",null,50000,"USD","tents","TEST")));
        assertEquals("REFUNDED",repository.orders(plan).stream().filter(o->o.category()==Category.TENTS).findFirst().orElseThrow().status());
        var ledger=repository.ledger("organizer").stream().filter(e->e.workflowId().equals(plan.id()) && e.operation()==Operation.REFUND_CAPTURE).findFirst().orElseThrow();
        assertEquals("refund",ledger.refundId()); assertEquals("ORGANIZER",ledger.requestedBy());
        assertTrue(repository.verifyChain(plan.id()));
    }
    @Test void aHoldIsRenewedOnlyAfterItsHonorPeriodForAnEventWithinThreeDays() {
        var plan=factory.create("organizer",new Intent("Meetup",30,5,150000,Instant.now().plus(Duration.ofDays(2)),"UTC","Pavilion","Rain","RENT"),
            new Offer("tents","tents","Tents",Category.TENTS,"Tent","",10000,10,""),new Offer("catering","catering","Kitchen",Category.CATERING,"Meal","",3000,100,""),List.of());
        repository.create(plan);repository.approve(plan.id(),"organizer",1,factory);var catering=plan.lines().get(1);
        var authorize=repository.enqueue(new PaymentCommand(UUID.randomUUID(),plan.id(),1,catering.id(),Operation.AUTHORIZE_ORDER,"catering",90000,"USD","order-c",null,plan.id().toString(),"test-v1"));
        repository.finish(authorize,succeeded(new ProviderResult("AUTHORIZED","order-c","auth",null,null,90000,"USD","catering","TEST")));
        assertTrue(repository.holdsToRenew().stream().noneMatch(p->p.id().equals(plan.id())));
        sql.update("UPDATE commerce.commands SET updated_at=now()-interval '4 days' WHERE id=?",authorize.id());
        assertTrue(repository.holdsToRenew().stream().anyMatch(p->p.id().equals(plan.id())));
        var renew=repository.enqueue(new PaymentCommand(UUID.randomUUID(),plan.id(),1,catering.id(),Operation.REAUTHORIZE_AUTHORIZATION,"catering",90000,"USD","auth",null,plan.id().toString(),"test-v1"));
        repository.finish(renew,succeeded(new ProviderResult("AUTHORIZED","order-c","renewed",null,null,90000,"USD","catering","TEST")));
        assertEquals("renewed",repository.order(plan,catering.id()).authorizationId());
        assertTrue(repository.holdsToRenew().stream().noneMatch(p->p.id().equals(plan.id())));
    }
    static GateResult succeeded(ProviderResult result) { return new GateResult("SUCCEEDED","FORWARDED","decision","dossier","a".repeat(64),null,"Done",result); }
    @Test void aDisputeFreezePreventsSpendingButPreservesConsentForAProtectiveVoid() {
        var plan=plan(150000);repository.create(plan);
        assertThrows(CommerceException.class,()->repository.approvedForVoid(plan.id()));
        repository.approve(plan.id(),"organizer",1,factory);repository.freeze(plan);
        assertThrows(CommerceException.class,()->repository.approvedForExecution(plan.id()));
        assertEquals(plan.id(),repository.approvedForVoid(plan.id()).id());
        assertTrue(repository.frozen(plan.id()));
    }
    @Test void aPayPalSignInCreatesOneAccountAndRefreshesItAfter() {
        var accounts=new OrganizerAccounts(source);
        var userId="https://www.paypal.com/webapps/auth/identity/user/"+UUID.randomUUID();
        var first=accounts.signInWithPayPal(userId,"Ada Organizer","ada@example.com",true);
        assertTrue(first.created());assertEquals("paypal:"+first.id(),first.owner());
        var again=accounts.signInWithPayPal(userId,"Ada Lovelace","ada@example.org",false);
        assertFalse(again.created(),"a returning organizer keeps their account");
        assertEquals(first.id(),again.id());assertEquals("Ada Lovelace",again.name());assertEquals("ada@example.org",again.email());
        assertEquals(1,sql.queryForObject("SELECT count(*) FROM commerce.organizer_accounts WHERE provider_user_id=?",Integer.class,userId));
        assertNotEquals(first.id(),accounts.signInWithPayPal(userId+"-other",null,null,false).id());
        assertThrows(IllegalArgumentException.class,()->accounts.signInWithPayPal(" ",null,null,false));
    }
    @Test void theLedgerListsAnOrganizersCommandsAndAgentRequestsNewestFirstAndNoOneElses() {
        var owner="ledger-"+UUID.randomUUID();
        var plan=factory.create(owner,new Intent("Meetup",30,5,150000,Instant.now().plusSeconds(3600),"UTC","Ledger pavilion","Rain","RENT"),
            new Offer("tents-standard","tents","Canopy Collective",Category.TENTS,"Canopy","",10000,10,""),
            new Offer("catering-seasonal","catering","Gather Kitchen",Category.CATERING,"Menu","",3000,80,""),List.of());
        repository.create(plan);repository.approve(plan.id(),owner,1,factory);
        var tents=plan.lines().stream().filter(l->l.category()==Category.TENTS).findFirst().orElseThrow();
        var catering=plan.lines().stream().filter(l->l.category()==Category.CATERING).findFirst().orElseThrow();
        var paid=repository.enqueue(command(plan,tents,50000));
        repository.finish(paid,new GateResult("SUCCEEDED","FORWARDED","decision","dossier-1","a".repeat(64),null,"Captured",new ProviderResult("CAPTURED","ORDER-1",null,"CAPTURE-1",null,50000,"USD","tents","TEST")));
        var early=new PaymentCommand(UUID.randomUUID(),plan.id(),1,catering.id(),Operation.CAPTURE_AUTHORIZATION,"catering",90000,"USD",null,null,plan.id().toString(),"test-v1");
        repository.recordAgentRequest(early,new GateResult("ESCALATE","HELD",null,"dossier-2",null,null,"Held: no delivery receipt",null),"AGENT_REQUEST_HELD");
        var ledger=repository.ledger(owner);
        assertEquals(2,ledger.size());
        var held=ledger.getFirst();
        assertEquals("AGENT",held.requestedBy());assertEquals("ESCALATE",held.state());assertEquals("HELD",held.execution());
        assertEquals("Gather Kitchen",held.merchantName());assertEquals(90000,held.amountMinor());assertNull(held.captureId());
        var capture=ledger.get(1);
        assertEquals("ORGANIZER",capture.requestedBy());assertEquals(Operation.CREATE_ORDER,capture.operation());assertEquals("SUCCEEDED",capture.state());
        assertEquals("Ledger pavilion",capture.venue());assertFalse(capture.settledAt().isBefore(capture.at()));assertEquals("CAPTURE-1",capture.captureId());assertEquals("ORDER-1",capture.providerOrderId());
        assertTrue(repository.ledger("someone-else").isEmpty(),"one organizer never sees another's payments");
    }
    @Test void anAgentTokenActsForItsOrganizerOnlyIsStoredHashedAndCanBeRevoked() {
        var agents=new AgentTokens(source);var owner="paypal:"+UUID.randomUUID();
        var issued=agents.issue(owner,"Postman");
        assertTrue(issued.token().startsWith(AgentTokens.PREFIX));assertEquals(issued.token().substring(issued.token().length()-4),issued.grant().hint());
        assertEquals(owner,agents.owner(issued.token()).orElseThrow());
        assertTrue(agents.owner(issued.token()+"x").isEmpty());assertTrue(agents.owner("not-a-token").isEmpty());assertTrue(agents.owner(null).isEmpty());
        var stored=sql.queryForObject("SELECT token_sha256 FROM commerce.agent_tokens WHERE id=?",String.class,issued.grant().id());
        assertEquals(AgentTokens.sha256(issued.token()),stored);assertFalse(stored.contains(issued.token()),"only a hash is kept");
        assertNotNull(agents.active(owner).getFirst().lastUsedAt(),"use is recorded");
        assertTrue(agents.active("someone-else").isEmpty());
        assertThrows(CommerceException.class,()->agents.revoke("someone-else",issued.grant().id()),"nobody else can revoke it");
        for(int i=1;i<AgentTokens.ACTIVE_LIMIT;i++)agents.issue(owner,null);
        assertEquals("AGENT_LIMIT",assertThrows(CommerceException.class,()->agents.issue(owner,"one too many")).code());
        agents.revoke(owner,issued.grant().id());
        assertTrue(agents.owner(issued.token()).isEmpty(),"a revoked token signs no agent in");
        assertEquals(AgentTokens.ACTIVE_LIMIT-1,agents.active(owner).size());
        assertThrows(CommerceException.class,()->agents.issue(owner,"x".repeat(61)));
    }
    PaymentCommand command(Plan plan,Line line,long amount) {return new PaymentCommand(UUID.randomUUID(),plan.id(),1,line.id(),Operation.CREATE_ORDER,"tents",amount,"USD",null,null,plan.id().toString(),"test-v1");}
}
