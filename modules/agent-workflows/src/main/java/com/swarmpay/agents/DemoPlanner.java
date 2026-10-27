package com.swarmpay.agents;

import com.swarmpay.domain.Commerce.*;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

public final class DemoPlanner implements AgentPlanner {
    public String source() { return "DEMO_RULES"; }
    public List<Assessment> assess(Intent intent, List<Offer> offers) {
        return List.of(
            new Assessment("Sourcing", "Two merchants cover the event. All displayed prices include delivery and taxes.",
                List.of(intent.tents() + " tent rentals", intent.attendees() + " catered meals", "Catalog stock is simulated"), source()),
            review(intent, offers));
    }
    /** Deterministic sourcing: the fullest combination within budget, or the lowest total when none fits. */
    public Proposal propose(Intent intent, List<Offer> catalog) {
        record Pair(Offer tents, Offer catering, long total) {}
        var pairs = new ArrayList<Pair>();
        for (var tents : catalog) for (var catering : catalog)
            if (tents.category() == Category.TENTS && catering.category() == Category.CATERING
                    && tents.capacity() >= intent.tents() && catering.capacity() >= intent.attendees())
                pairs.add(new Pair(tents, catering, Math.addExact(tents.unitMinor() * intent.tents(), catering.unitMinor() * intent.attendees())));
        if (pairs.isEmpty()) throw new IllegalArgumentException("No catalog combination has enough capacity");
        var affordable = pairs.stream().filter(p -> p.total() <= intent.budgetMinor()).toList();
        var choice = affordable.isEmpty() ? pairs.stream().min(Comparator.comparingLong(Pair::total)).orElseThrow()
            : affordable.stream().max(Comparator.comparingLong(Pair::total)).orElseThrow();
        var dollars = NumberFormat.getCurrencyInstance(Locale.US);
        String budget = dollars.format(intent.budgetMinor() / 100.0), total = dollars.format(choice.total() / 100.0);
        var sourcing = new Assessment("Sourcing",
            "Chose " + choice.tents().title() + " and the " + choice.catering().title() + (affordable.isEmpty()
                ? ". No combination fits the budget, so this is the lowest total for your review."
                : ": the fullest service that stays within your budget."),
            List.of(intent.tents() + " tent rentals and " + intent.attendees() + " catered meals",
                total + " of a " + budget + " budget",
                affordable.size() + " of " + pairs.size() + " combinations fit the budget",
                "Catalog stock is simulated"), source());
        return new Proposal(choice.tents().id(), choice.catering().id(), sourcing);
    }
    public Assessment review(Intent intent, List<Offer> offers) {
        return new Assessment("Risk & milestones", "Catering is authorized now and paid after a verified delivery receipt.",
            List.of("Seller and amount are fixed at approval", "Photo-only evidence is held for review", "A quote expires after 30 minutes"), source());
    }
}
