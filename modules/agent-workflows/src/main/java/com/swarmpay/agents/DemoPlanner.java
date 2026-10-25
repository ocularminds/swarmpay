package com.swarmpay.agents;

import com.swarmpay.domain.Commerce.*;
import java.util.List;

public final class DemoPlanner implements AgentPlanner {
    public String source() { return "DEMO_RULES"; }
    public List<Assessment> assess(Intent intent, List<Offer> offers) {
        return List.of(
            new Assessment("Sourcing", "Two merchants cover the event. All displayed prices include delivery and taxes.",
                List.of(intent.tents() + " tent rentals", intent.attendees() + " catered meals", "Catalog stock is simulated"), source()),
            new Assessment("Risk & milestones", "Catering is authorized now and paid after a verified delivery receipt.",
                List.of("Seller and amount are fixed at approval", "Photo-only evidence is held for review", "A quote expires after 30 minutes"), source())
        );
    }
}
