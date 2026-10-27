package com.swarmpay.domain;

import com.swarmpay.domain.Commerce.*;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

public final class PlanFactory {
    private final Clock clock;
    public PlanFactory(Clock clock) { this.clock = clock; }
    public Plan create(String owner, Intent intent, Offer tents, Offer catering, List<Assessment> assessments) {
        checkSchedule(intent);
        if (tents.category() != Category.TENTS || catering.category() != Category.CATERING) throw CommerceException.invalid("Select one offer in each category");
        if (intent.tents() > tents.capacity() || intent.attendees() > catering.capacity()) throw CommerceException.invalid("An offer does not have enough capacity");
        var lines = List.of(line(tents, intent.tents(), "CAPTURE"), line(catering, intent.attendees(), "AUTHORIZE"));
        long total = lines.stream().mapToLong(Line::totalMinor).reduce(0, Math::addExact);
        return new Plan(UUID.randomUUID(), 1, owner, intent, lines, assessments, total,
                clock.instant().plus(Duration.ofMinutes(30)), "DRAFT", clock.instant());
    }
    public void checkSchedule(Intent intent) {
        if (!intent.eventAt().isAfter(clock.instant())) throw CommerceException.invalid("Choose a future event");
        if (intent.eventAt().isAfter(clock.instant().plus(Duration.ofDays(28)))) throw CommerceException.invalid("The event must be within 28 days; longer bookings require a different payment schedule");
    }
    public void checkApproval(Plan plan) {
        if (!clock.instant().isBefore(plan.expiresAt())) throw CommerceException.conflict("The quote expired. Create a fresh plan.");
        if (plan.totalMinor() > plan.intent().budgetMinor()) throw new CommerceException("BUDGET_EXCEEDED", "This plan exceeds your total budget. Choose lower-priced offers or revise the budget.", 422);
        if (!plan.intent().eventAt().isAfter(clock.instant())) throw CommerceException.conflict("The event date has passed");
    }
    private static Line line(Offer offer, int quantity, String intent) {
        return new Line(UUID.randomUUID(), offer.id(), offer.merchantId(), offer.merchantName(), offer.category(),
                offer.title(), quantity, offer.unitMinor(), Money.usd(offer.unitMinor()).times(quantity).minor(), intent);
    }
}
