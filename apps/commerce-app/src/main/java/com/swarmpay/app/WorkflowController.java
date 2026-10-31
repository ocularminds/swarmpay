package com.swarmpay.app;

import com.swarmpay.domain.Commerce.*;
import com.swarmpay.domain.CommerceException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.security.Principal;
import java.util.*;

@RestController
class WorkflowController {
    private final WorkflowService flows;
    private final Catalog catalog;
    private final IntentInterpreter interpreter;
    WorkflowController(WorkflowService flows,Catalog catalog,IntentInterpreter interpreter) { this.flows=flows; this.catalog=catalog; this.interpreter=interpreter; }
    record CreatePlan(Intent intent,String tentOfferId,String cateringOfferId) {}
    record Approval(int version) {}
    record BuyerApproval(String providerOrderId) {}
    record DescribeIntent(String request,String timezone) {}
    @GetMapping("/api/catalog") List<Offer> catalog() { return catalog.offers(); }
    @PostMapping("/api/intent") IntentSuggestion interpret(@RequestBody DescribeIntent body) { return interpreter.interpret(body.request(),body.timezone()); }
    @GetMapping("/api/plans") List<Plan> plans(Principal user) { return flows.list(user.getName()); }
    @PostMapping("/api/plans") Plan create(@RequestBody CreatePlan body,Principal user) { return flows.propose(user.getName(),body.intent(),body.tentOfferId(),body.cateringOfferId()); }
    @GetMapping("/api/plans/{id}") Workflow workflow(@PathVariable UUID id,Principal user) { return flows.get(id,user.getName()); }
    @PostMapping("/api/plans/{id}/approve") Plan approve(@PathVariable UUID id,@RequestBody Approval body,Principal user) { return flows.approve(id,user.getName(),body.version()); }
    @PostMapping("/api/plans/{id}/orders/{order}/checkout") GateResult checkout(@PathVariable UUID id,@PathVariable UUID order,Principal user) { return flows.checkout(id,order,user.getName()); }
    @PostMapping("/api/plans/{id}/orders/{order}/buyer-approved") GateResult buyerApproved(@PathVariable UUID id,@PathVariable UUID order,@RequestBody BuyerApproval approval,Principal user) { return flows.buyerApproved(id,order,user.getName(),approval.providerOrderId()); }
    @PostMapping("/api/plans/{id}/milestone") GateResult milestone(@PathVariable UUID id,Principal user) { return flows.milestone(id,user.getName()); }
    /** The organizer asks the milestone agent to request payment now: the same path as the MCP tool request_milestone_payment. */
    @PostMapping("/api/plans/{id}/agent-milestone") GateResult agentMilestone(@PathVariable UUID id,Principal user) { return flows.forAgent(user.getName()).requestMilestonePayment(id); }
    @PostMapping("/api/plans/{id}/void") GateResult voidAuthorization(@PathVariable UUID id,Principal user) { return flows.voidAuthorization(id,user.getName()); }
    @PostMapping("/api/plans/{id}/cancel") Workflow cancel(@PathVariable UUID id,Principal user) { return flows.cancel(id,user.getName()); }
    @PostMapping("/api/plans/{id}/freeze") Map<String,Boolean> freeze(@PathVariable UUID id,Principal user) { flows.freeze(id,user.getName()); return Map.of("frozen",true); }
    @PostMapping("/api/plans/{id}/receipt") Workflow receipt(@PathVariable UUID id,@RequestBody SignedReceipt body,Principal user) { return flows.receipt(id,user.getName(),body); }
    @PostMapping("/api/plans/{id}/venue-request") DeliveryFacts venueRequest(@PathVariable UUID id,Principal user) { return flows.venueRequest(id,user.getName()); }
    @PostMapping("/api/venue/receipts") Map<String,Boolean> venueReceipt(@RequestBody SignedReceipt body) { flows.venueReceipt(body); return Map.of("accepted",true); }
    @PostMapping("/api/plans/{id}/photo") Map<String,String> photo(@PathVariable UUID id,@RequestParam MultipartFile file,Principal user) throws Exception { flows.photo(id,user.getName(),file.getBytes(),file.getContentType()); return Map.of("state","HELD","message","Photo saved. A trusted venue receipt is still required."); }
    @GetMapping("/api/plans/{id}/commands") List<Map<String,Object>> commands(@PathVariable UUID id,Principal user) { return flows.commands(id,user.getName()); }
    @PostMapping("/api/commands/{id}/reconcile") GateResult reconcile(@PathVariable UUID id,Principal user) { return flows.reconcile(id,user.getName()); }
    @PostMapping("/api/commands/{id}/retry") GateResult retry(@PathVariable UUID id,Principal user) { return flows.retry(id,user.getName()); }
    @GetMapping("/api/ledger") List<LedgerEntry> ledger(@RequestParam(required=false) UUID workflowId,Principal user) { return flows.ledger(user.getName(),workflowId); }
    @GetMapping("/api/plans/{id}/evidence") Map<String,Object> evidence(@PathVariable UUID id,Principal user) { return flows.evidence(id,user.getName()); }
}
@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(CommerceException.class) ResponseEntity<Map<String,String>> commerce(CommerceException e) { return ResponseEntity.status(e.status()).body(Map.of("code",e.code(),"message",e.getMessage())); }
    @ExceptionHandler({IllegalArgumentException.class,NullPointerException.class,org.springframework.http.converter.HttpMessageNotReadableException.class})
    ResponseEntity<Map<String,String>> invalid(Exception e) { return ResponseEntity.badRequest().body(Map.of("code","INVALID_REQUEST","message","Check the request fields and try again.")); }
    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    ResponseEntity<Map<String,String>> tooLarge(Exception e) { return ResponseEntity.status(413).body(Map.of("code","FILE_TOO_LARGE","message","Use an image smaller than 2 MB.")); }
}
