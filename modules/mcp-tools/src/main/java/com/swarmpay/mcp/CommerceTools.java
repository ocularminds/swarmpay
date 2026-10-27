package com.swarmpay.mcp;

import com.swarmpay.domain.Commerce.*;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import java.util.List;
import java.util.UUID;

/** Human consent and buyer approval are deliberately absent from the tool surface. */
public final class CommerceTools {
    private final AgentActions actions;
    public CommerceTools(AgentActions actions) { this.actions = actions; }
    @Tool(name="search_offers",description="Search the curated demo catalog. Category is ALL, TENTS or CATERING. No live stock guarantee.")
    public List<Offer> searchOffers(@ToolParam(description="ALL, TENTS or CATERING") String category) { return actions.searchOffers(category); }
    @Tool(name="get_offer",description="Read an allowlisted catalog offer and its server-owned price.")
    public Offer getOffer(String offerId) { return actions.getOffer(offerId); }
    @Tool(name="propose_checkout",description="Prepare a reviewable plan. Omit both offer IDs to let the Sourcing Agent choose them. Does not authorize funds. Requires confirmed event details and tentMode RENT.")
    public Plan proposeCheckout(Intent intent,
                                @ToolParam(required=false,description="A TENTS offer ID, or omit both IDs") String tentOfferId,
                                @ToolParam(required=false,description="A CATERING offer ID, or omit both IDs") String cateringOfferId) {
        return actions.proposeCheckout(intent,tentOfferId,cateringOfferId);
    }
    @Tool(name="get_workflow_status",description="Read the authenticated organizer's plan and each merchant's current payment state.")
    public Workflow getWorkflowStatus(UUID workflowId) { return actions.getWorkflow(workflowId); }
    @Tool(name="assess_plan",description="Read the sourcing and risk assessments already attached to the organizer's reviewed plan.")
    public List<Assessment> assessPlan(UUID workflowId) { return actions.getWorkflow(workflowId).plan().assessments(); }
    @Tool(name="get_payment_evidence",description="Read the organizer's redacted application audit chain. This is not a Decionis signature proof.")
    public List<Event> getPaymentEvidence(UUID workflowId) { return actions.getEvidence(workflowId); }
    @Tool(name="request_milestone_payment",description="Request the approved catering capture. Always goes through AgentSafe, which decides; without a trusted delivery receipt it holds the request and no payment is sent.")
    public GateResult requestMilestonePayment(UUID workflowId) { return actions.requestMilestonePayment(workflowId); }
}
