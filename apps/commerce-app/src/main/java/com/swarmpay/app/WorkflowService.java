package com.swarmpay.app;

import com.swarmpay.domain.Commerce.*;
import com.swarmpay.domain.*;
import com.swarmpay.integrations.*;
import com.swarmpay.persistence.CommerceRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import java.util.*;
import java.util.concurrent.Semaphore;

@Service
public final class WorkflowService {
    private final CommerceRepository db;
    private final Catalog catalog;
    private final PlanFactory factory;
    private final AgentPlanner agents;
    private final AuthorityGateway authority;
    private final ReceiptVerifier verifier;
    private final String mode;
    private final String policyVersion;
    private final Semaphore planning=new Semaphore(2);
    public WorkflowService(CommerceRepository db,Catalog catalog,PlanFactory factory,AgentPlanner agents,AuthorityGateway authority,ReceiptVerifier verifier,String runtimeMode) {
        this.db=db; this.catalog=catalog; this.factory=factory; this.agents=agents; this.authority=authority; this.verifier=verifier;
        mode=runtimeMode; policyVersion=RuntimeSettings.required("DECIONIS_POLICY_VERSION");
    }
    /** With no offers chosen, the Sourcing Agent chooses them; Java checks its choice like any other before a plan exists. */
    public Plan propose(String owner,Intent intent,String tentOfferId,String cateringOfferId) {
        if(tentOfferId!=null && tentOfferId.isBlank()) tentOfferId=null;
        if(cateringOfferId!=null && cateringOfferId.isBlank()) cateringOfferId=null;
        boolean agentChooses=tentOfferId==null && cateringOfferId==null;
        if(!agentChooses && (tentOfferId==null || cateringOfferId==null)) throw CommerceException.invalid("Choose both offers, or let the Sourcing Agent choose both.");
        // Validate counts, dates and prices before paying for any model inference.
        if(agentChooses) {
            factory.checkSchedule(intent);
            if(catalog.offers().stream().noneMatch(o->o.category()==Category.TENTS && o.capacity()>=intent.tents())
                || catalog.offers().stream().noneMatch(o->o.category()==Category.CATERING && o.capacity()>=intent.attendees()))
                throw CommerceException.invalid("No catalog offer has enough capacity for this event");
        } else factory.create(owner,intent,catalog.get(tentOfferId),catalog.get(cateringOfferId),List.of());
        if(!planning.tryAcquire()) throw new CommerceException("BUSY","Two plans are already being prepared. Try again shortly.",429);
        try {
            Offer tents,catering; List<Assessment> assessments;
            if(agentChooses) {
                var proposal=agents.propose(intent,catalog.offers());
                tents=proposed(proposal.tentOfferId(),Category.TENTS); catering=proposed(proposal.cateringOfferId(),Category.CATERING);
                try { factory.create(owner,intent,tents,catering,List.of()); }
                catch(CommerceException e) { throw rejected(e.getMessage()); }
                assessments=List.of(proposal.sourcing(),agents.review(intent,List.of(tents,catering)));
            } else {
                tents=catalog.get(tentOfferId); catering=catalog.get(cateringOfferId);
                assessments=agents.assess(intent,List.of(tents,catering));
            }
            var plan=factory.create(owner,intent,tents,catering,assessments);
            db.create(plan); return plan;
        } finally { planning.release(); }
    }
    private Offer proposed(String id,Category category) {
        return catalog.offers().stream().filter(o->o.id().equals(id) && o.category()==category).findFirst()
            .orElseThrow(()->rejected("It named an offer outside the catalog."));
    }
    private static CommerceException rejected(String reason) {
        return new CommerceException("AGENT_PROPOSAL_REJECTED","The Sourcing Agent's choice was rejected: "+reason+" Choose the offers yourself.",502);
    }
    public List<Plan> list(String owner) { return db.list(owner); }
    public Plan approve(UUID id,String owner,int version) {
        try { return db.approve(id,owner,version,factory); }
        catch(CommerceException e) { if(!e.code().equals("NOT_FOUND")) db.evidence(db.owned(id,owner).id(),"APPROVAL_BLOCKED",e.getMessage(),"APPLICATION"); throw e; }
    }
    public Workflow get(UUID id,String owner) {
        var plan=db.owned(id,owner); var orders=db.orders(plan);
        long paid=orders.stream().filter(o->o.status().equals("CAPTURED")).mapToLong(OrderView::amountMinor).sum();
        boolean receipt=orders.stream().filter(o->o.category()==Category.CATERING).anyMatch(o->db.receiptDigest(o.id())!=null);
        return new Workflow(plan,orders,db.events(id),plan.status().equals("APPROVED")?plan.totalMinor():0,paid,mode,receipt,db.frozen(id),db.agentRequests(id));
    }
    public GateResult checkout(UUID id,UUID orderId,String owner) { return payment(db.owned(id,owner),orderId,Operation.CREATE_ORDER); }
    public GateResult buyerApproved(UUID id,UUID orderId,String owner,String providerOrderId) {
        var plan=db.owned(id,owner); var order=db.order(plan,orderId);
        if(!Objects.equals(order.providerOrderId(),providerOrderId)) throw CommerceException.held("Buyer approval does not match this checkout");
        // PayPal independently verifies the buyer's native approval during authorize/capture.
        return payment(plan,orderId,order.category()==Category.TENTS?Operation.CAPTURE_ORDER:Operation.AUTHORIZE_ORDER);
    }
    public GateResult milestone(UUID id,String owner) {
        var plan=db.owned(id,owner);
        var line=plan.lines().stream().filter(l->l.category()==Category.CATERING).findFirst().orElseThrow();
        return payment(plan,line.id(),Operation.CAPTURE_AUTHORIZATION);
    }
    /**
     * An agent asks for the catering capture. Once a verified receipt exists this is the ordinary
     * milestone. Before then the request still goes to AgentSafe, which decides; it is never queued,
     * so it cannot be retried or replayed into a payment, and the executor refuses any command
     * outside the outbox.
     */
    public GateResult agentMilestone(UUID id,String owner) {
        var plan=db.owned(id,owner);
        var line=plan.lines().stream().filter(l->l.category()==Category.CATERING).findFirst().orElseThrow();
        if(db.receiptDigest(line.id())!=null) return milestone(id,owner);
        db.approvedForExecution(id);
        var order=db.order(plan,line.id());
        if(!order.status().equals("AUTHORIZED") || order.authorizationId()==null) throw CommerceException.held("Catering is not authorized yet, so there is no payment to request.");
        var request=new PaymentCommand(UUID.randomUUID(),plan.id(),plan.version(),line.id(),Operation.CAPTURE_AUTHORIZATION,line.merchantId(),
            line.totalMinor(),"USD",order.authorizationId(),null,plan.id().toString(),policyVersion);
        var decided=authority.execute(request);
        String message=switch(decided.state()) {
            case "ESCALATE","HELD" -> "AgentSafe held the agent's request to pay catering for human review: no verified delivery receipt is attached. No payment was sent.";
            case "BLOCK","BLOCKED" -> "AgentSafe blocked the agent's request to pay catering. No payment was sent.";
            case "AUTHORITY_UNAVAILABLE" -> "Authority was unavailable, so the agent's request to pay catering was not sent.";
            default -> "The agent's request to pay catering was not executed. "+decided.message();
        };
        var result=new GateResult(decided.state(),decided.execution(),decided.decisionId(),decided.dossierId(),decided.intentHash(),decided.intentId(),message,decided.result());
        db.recordAgentRequest(request,result,"AGENT_REQUEST_"+decided.state());
        return result;
    }
    public GateResult voidAuthorization(UUID id,String owner) {
        var plan=db.owned(id,owner);
        var line=plan.lines().stream().filter(l->l.category()==Category.CATERING).findFirst().orElseThrow();
        return payment(plan,line.id(),Operation.VOID_AUTHORIZATION);
    }
    private GateResult payment(Plan plan,UUID orderId,Operation operation) {
        try {
            if(operation==Operation.VOID_AUTHORIZATION) db.approvedForVoid(plan.id());
            else db.approvedForExecution(plan.id());
            var order=db.order(plan,orderId); var line=db.line(plan,orderId);
            String digest=operation==Operation.CAPTURE_AUTHORIZATION?db.receiptDigest(orderId):null;
            if(operation==Operation.CAPTURE_AUTHORIZATION && digest==null) throw CommerceException.held("A photo alone cannot release payment. A trusted venue receipt is required.");
            String resource=switch(operation) { case CREATE_ORDER -> null; case CAPTURE_ORDER,AUTHORIZE_ORDER -> order.providerOrderId(); default -> order.authorizationId(); };
            if(operation!=Operation.CREATE_ORDER && resource==null) throw CommerceException.held("Complete this merchant's buyer approval first");
            // Only a buyer approval reaches here with these operations: after a declined funding source, it retries the same command.
            if(operation==Operation.CAPTURE_ORDER || operation==Operation.AUTHORIZE_ORDER) db.requeueAfterBuyerAction(plan.id(),orderId,operation);
            var command=db.enqueue(new PaymentCommand(UUID.randomUUID(),plan.id(),plan.version(),line.id(),operation,line.merchantId(),line.totalMinor(),"USD",resource,digest,plan.id().toString(),policyVersion));
            return dispatch(command);
        } catch(CommerceException e) { db.evidence(plan.id(),"PAYMENT_HELD",e.getMessage(),"APPLICATION"); throw e; }
    }
    public GateResult dispatch(PaymentCommand command) {
        if(db.claim(command.id())) {
            var result=authority.execute(command);
            db.finish(command,result); return result;
        }
        var result=db.commandResult(command.id());
        return result!=null?result:new GateResult("QUEUED","NOT_FORWARDED",null,null,null,null,"Payment command is being processed.",null);
    }
    public GateResult reconcile(UUID id,String owner) {
        var command=db.command(id,owner); var result=authority.reconcile(command);
        db.finish(command,result); return result;
    }
    public GateResult retry(UUID id,String owner) {
        var command=db.command(id,owner);
        if(command.operation()==Operation.VOID_AUTHORIZATION) db.approvedForVoid(command.workflowId());
        else db.approvedForExecution(command.workflowId());
        db.retryNotForwarded(command);
        return dispatch(command);
    }
    public Workflow receipt(UUID id,String owner,SignedReceipt signed) {
        acceptReceipt(db.owned(id,owner),signed); return get(id,owner);
    }
    /**
     * The organizer asks the simulated venue to confirm delivery. Only the
     * organizer's session reaches this, and the venue signs these recorded
     * facts with its own key; the application never holds that key.
     */
    public DeliveryFacts venueRequest(UUID id,String owner) {
        var plan=db.owned(id,owner);
        var line=plan.lines().stream().filter(l->l.category()==Category.CATERING).findFirst().orElseThrow();
        db.approvedForExecution(id);
        if(!db.order(plan,line.id()).status().equals("AUTHORIZED"))
            throw CommerceException.held("Authorize catering first. The venue confirms delivery once its funds are authorized.");
        verifier.checkDeliveryWindow(plan);
        db.evidence(id,"VENUE_CONFIRMATION_REQUESTED","You asked the simulated venue to confirm the catering delivery.","HUMAN");
        return new DeliveryFacts(plan.id(),line.id(),line.merchantId(),plan.intent().venue(),line.quantity());
    }
    public void venueReceipt(SignedReceipt signed) {
        if(signed.payload()==null || signed.payload().length()>16000) throw CommerceException.invalid("Invalid receipt envelope");
        var receipt=Json.read(new String(Base64.getDecoder().decode(signed.payload()),java.nio.charset.StandardCharsets.UTF_8),Receipt.class);
        acceptReceipt(db.approvedForExecution(receipt.workflowId()),signed);
    }
    private void acceptReceipt(Plan plan,SignedReceipt signed) {
        var line=plan.lines().stream().filter(l->l.category()==Category.CATERING).findFirst().orElseThrow();
        try {
            var receipt=verifier.verify(signed,plan,line);
            db.saveReceipt(plan,receipt,signed,ReceiptVerifier.digest(signed.payload()));
        } catch(CommerceException e) { db.evidence(plan.id(),"RECEIPT_REJECTED",e.getMessage(),"APPLICATION"); throw e; }
        // The durable receipt also appears in readyMilestones after a crash here.
        if(db.order(plan,line.id()).status().equals("AUTHORIZED")) payment(plan,line.id(),Operation.CAPTURE_AUTHORIZATION);
    }
    public void photo(UUID id,String owner,byte[] bytes,String mime) {
        if(bytes.length==0 || bytes.length>2_000_000) throw CommerceException.invalid("Use an image smaller than 2 MB");
        boolean png=bytes.length>8 && bytes[0]==(byte)137 && bytes[1]==80 && bytes[2]==78 && bytes[3]==71;
        boolean jpeg=bytes.length>3 && bytes[0]==(byte)255 && bytes[1]==(byte)216 && bytes[2]==(byte)255;
        if(!(png && "image/png".equals(mime)) && !(jpeg && "image/jpeg".equals(mime))) throw CommerceException.invalid("Use a PNG or JPEG photo");
        db.savePhoto(db.owned(id,owner),bytes,mime,ReceiptVerifier.digest(Base64.getEncoder().encodeToString(bytes)));
    }
    public void freeze(UUID id,String owner) { db.freeze(db.owned(id,owner)); }
    public Map<String,Object> evidence(UUID id,String owner) {
        var plan=db.owned(id,owner);
        return Map.of("workflowId",id,"mode",mode,"applicationChainVerified",db.verifyChain(id),"events",db.events(id),"commands",commands(id,owner),
            "proofScope","Application hash chain plus AgentSafe correlation IDs. Hosted Decionis signature verification is a separate integration check.");
    }
    public List<Map<String,Object>> commands(UUID id,String owner) {
        var plan=db.owned(id,owner);
        return db.commandsFor(plan).stream().map(c -> { var m=new LinkedHashMap<String,Object>(); m.put("command",c); m.put("state",db.commandState(c.id())); m.put("result",db.commandResult(c.id())); return (Map<String,Object>)m; }).toList();
    }
    @Scheduled(fixedDelay=3000,initialDelay=5000)
    public void work() {
        for(var command:db.queued()) dispatch(command);
        for(var command:db.needsReconciliation()) {
            var result=authority.reconcile(command);
            db.finish(command,result);
        }
        for(var plan:db.readyMilestones()) {
            try { milestone(plan.id(),plan.ownerId()); } catch(CommerceException ignored) { /* Held reason is persisted by payment(). */ }
        }
    }
    public AgentActions forAgent(String owner) {
        return new AgentActions() {
            public List<Offer> searchOffers(String category) { if(!Set.of("ALL","TENTS","CATERING").contains(category)) throw CommerceException.invalid("Choose ALL, TENTS or CATERING"); return catalog.offers().stream().filter(o->category.equals("ALL") || o.category().name().equals(category)).toList(); }
            public Offer getOffer(String id) { return catalog.get(id); }
            public Plan proposeCheckout(Intent intent,String tents,String catering) { return propose(owner,intent,tents,catering); }
            public Workflow getWorkflow(UUID id) { return get(id,owner); }
            public List<Event> getEvidence(UUID id) { db.owned(id,owner); return db.events(id); }
            public GateResult requestMilestonePayment(UUID id) { return agentMilestone(id,owner); }
        };
    }
}
