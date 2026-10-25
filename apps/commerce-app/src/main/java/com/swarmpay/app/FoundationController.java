package com.swarmpay.app;

import com.swarmpay.domain.Commerce.Catalog;
import com.swarmpay.domain.Commerce.Offer;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
class FoundationController {
    private final Catalog catalog;
    FoundationController(Catalog catalog) { this.catalog=catalog; }
    @GetMapping("/api/catalog") List<Offer> catalog() { return catalog.offers(); }
}
