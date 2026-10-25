package com.swarmpay.integrations;

import com.swarmpay.domain.Commerce.*;
import com.swarmpay.domain.CommerceException;
import java.util.List;

public final class DemoCatalog implements Catalog {
    private static final List<Offer> OFFERS = List.of(
        new Offer("tents-standard", "tents", "Canopy Collective", Category.TENTS, "Weather-ready canopy",
                "3 × 3 m commercial tent rental. Weighted bases, setup, delivery and taxes included.", 10000, 10, "Rain-ready"),
        new Offer("tents-premium", "tents", "Canopy Collective", Category.TENTS, "Premium event canopy",
                "4 × 4 m canopy rental with sidewalls. Setup, delivery and taxes included.", 16000, 8, "Extra shelter"),
        new Offer("catering-seasonal", "catering", "Gather Kitchen", Category.CATERING, "Seasonal meetup menu",
                "A warm meal, vegetarian option and drink per guest. Delivery and taxes included.", 3000, 80, "Vegetarian option"),
        new Offer("catering-signature", "catering", "Gather Kitchen", Category.CATERING, "Signature sharing menu",
                "A hot buffet and dessert per guest. Delivery and taxes included.", 4000, 100, "Full service")
    );
    public List<Offer> offers() { return OFFERS; }
    public Offer get(String id) { return OFFERS.stream().filter(o -> o.id().equals(id)).findFirst().orElseThrow(() -> CommerceException.invalid("Unknown catalog offer")); }
}
