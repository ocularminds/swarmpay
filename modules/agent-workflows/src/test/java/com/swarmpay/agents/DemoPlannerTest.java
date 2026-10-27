package com.swarmpay.agents;

import com.swarmpay.domain.Commerce.*;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class DemoPlannerTest {
    final DemoPlanner planner=new DemoPlanner();
    // The demo catalog's prices and capacities, as the commerce application serves them.
    final List<Offer> catalog=List.of(
        new Offer("tents-standard","tents","Canopy Collective",Category.TENTS,"Weather-ready canopy","",10000,10,""),
        new Offer("tents-premium","tents","Canopy Collective",Category.TENTS,"Premium event canopy","",16000,8,""),
        new Offer("catering-seasonal","catering","Gather Kitchen",Category.CATERING,"Seasonal meetup menu","",3000,80,""),
        new Offer("catering-signature","catering","Gather Kitchen",Category.CATERING,"Signature sharing menu","",4000,100,""));
    Intent intent(long budget,int guests) { return new Intent("Meetup",guests,5,budget,Instant.now().plusSeconds(3600),"UTC","Pavilion","Rain","RENT"); }

    @Test void choosesTheFullestServiceThatStaysWithinBudget() {
        var proposal=planner.propose(intent(150000,30),catalog);
        assertEquals("tents-standard",proposal.tentOfferId());assertEquals("catering-seasonal",proposal.cateringOfferId());
        assertEquals("Sourcing",proposal.sourcing().role());
        assertTrue(proposal.sourcing().facts().contains("$1,400.00 of a $1,500.00 budget"));
        var generous=planner.propose(intent(200000,30),catalog);
        assertEquals("tents-premium",generous.tentOfferId());assertEquals("catering-signature",generous.cateringOfferId());
    }
    @Test void showsTheLowestTotalForReviewWhenNothingFits() {
        var proposal=planner.propose(intent(130000,30),catalog);
        assertEquals("tents-standard",proposal.tentOfferId());assertEquals("catering-seasonal",proposal.cateringOfferId());
        assertTrue(proposal.sourcing().summary().contains("No combination fits the budget"));
    }
    @Test void skipsOffersWithoutEnoughCapacity() {
        // Seasonal catering serves 80 guests; 90 guests need the signature menu.
        assertEquals("catering-signature",planner.propose(intent(500000,90),catalog).cateringOfferId());
        assertThrows(IllegalArgumentException.class,()->planner.propose(intent(500000,150),catalog));
    }
}
