package com.swarmpay.mcp;

import com.swarmpay.domain.Commerce.*;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import java.util.List;

/** Read-only foundation tools; approval and payments are outside this phase. */
public final class CommerceTools {
    private final Catalog catalog;
    public CommerceTools(Catalog catalog) { this.catalog=catalog; }
    @Tool(name="search_offers",description="Search the curated demo catalog. Category is ALL, TENTS or CATERING. No live stock guarantee.")
    public List<Offer> searchOffers(@ToolParam(description="ALL, TENTS or CATERING") String category) {
        return catalog.offers().stream().filter(offer -> "ALL".equals(category)||offer.category().name().equals(category)).toList();
    }
    @Tool(name="get_offer",description="Read an allowlisted offer and its server-owned price.")
    public Offer getOffer(String offerId) { return catalog.get(offerId); }
}
