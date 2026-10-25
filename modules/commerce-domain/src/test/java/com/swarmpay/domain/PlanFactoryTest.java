package com.swarmpay.domain;

import com.swarmpay.domain.Commerce.*;
import java.time.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PlanFactoryTest {
    final Instant now = Instant.parse("2026-10-25T12:00:00Z");
    final PlanFactory factory = new PlanFactory(Clock.fixed(now, ZoneOffset.UTC));
    final Offer tents = new Offer("t", "tents", "Tents", Category.TENTS, "Tent", "", 10000, 10, "");
    final Offer catering = new Offer("c", "catering", "Kitchen", Category.CATERING, "Meal", "", 3000, 100, "");
    Intent intent(long budget) { return new Intent("A rainy meetup", 30, 5, budget, now.plusSeconds(3600), "Europe/Stockholm", "Harbor", "Rain", "RENT"); }
    @Test void separatesImmediatePaymentFromServiceAuthorization() {
        var plan = factory.create("owner", intent(150000), tents, catering, List.of());
        assertEquals(140000, plan.totalMinor());
        assertEquals(List.of("CAPTURE", "AUTHORIZE"), plan.lines().stream().map(Line::paymentIntent).toList());
        assertDoesNotThrow(() -> factory.checkApproval(plan));
    }
    @Test void overBudgetCanBeReviewedButCannotBeApproved() {
        var plan = factory.create("owner", intent(130000), tents, catering, List.of());
        var error = assertThrows(CommerceException.class, () -> factory.checkApproval(plan));
        assertEquals("BUDGET_EXCEEDED", error.code());
    }
    @Test void expiredQuoteCannotBeApproved() {
        var plan = factory.create("owner", intent(150000), tents, catering, List.of());
        var later = new PlanFactory(Clock.fixed(now.plusSeconds(1801), ZoneOffset.UTC));
        assertThrows(CommerceException.class, () -> later.checkApproval(plan));
    }
}
