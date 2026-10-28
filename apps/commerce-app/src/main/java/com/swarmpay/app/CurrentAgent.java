package com.swarmpay.app;

import com.swarmpay.domain.Commerce.*;
import com.swarmpay.domain.CommerceException;
import org.springframework.security.core.context.SecurityContextHolder;
import java.util.List;
import java.util.UUID;

/** The agent acts for whichever organizer its token belongs to, decided on every call and never at startup. */
final class CurrentAgent implements AgentActions {
    private final WorkflowService workflows;
    CurrentAgent(WorkflowService workflows) { this.workflows = workflows; }
    private AgentActions actions() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getAuthorities().stream().noneMatch(a -> a.getAuthority().equals("ROLE_MCP")))
            throw new CommerceException("UNAUTHORIZED", "An agent token is required", 401);
        return workflows.forAgent(auth.getName());
    }
    public List<Offer> searchOffers(String category) { return actions().searchOffers(category); }
    public Offer getOffer(String id) { return actions().getOffer(id); }
    public Plan proposeCheckout(Intent intent, String tentOfferId, String cateringOfferId) { return actions().proposeCheckout(intent, tentOfferId, cateringOfferId); }
    public Workflow getWorkflow(UUID workflowId) { return actions().getWorkflow(workflowId); }
    public List<Event> getEvidence(UUID workflowId) { return actions().getEvidence(workflowId); }
    public GateResult requestMilestonePayment(UUID workflowId) { return actions().requestMilestonePayment(workflowId); }
}
