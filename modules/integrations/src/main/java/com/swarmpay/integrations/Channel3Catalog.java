package com.swarmpay.integrations;

import com.fasterxml.jackson.databind.JsonNode;
import com.swarmpay.domain.Commerce.*;
import com.swarmpay.domain.CommerceException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;

/**
 * Purchasable tents from Channel3's product data, beside the curated rentals and catering. The Sourcing Agent may choose
 * only among the products the server fetched for this event, at the prices Channel3 returned; the tents merchant fills
 * the order and is the seller paid through PayPal. Channel3 is reached through the egress proxy, never PayPal.
 */
public final class Channel3Catalog implements Catalog {
    public static final String API = "https://api.trychannel3.com";
    static final int MAX_TENTS = 20;
    private final Catalog curated;
    private final String key, api;
    private final HttpClient http;

    public Channel3Catalog(Catalog curated, String key) {
        this(curated, key, API, HttpClient.newBuilder().proxy(ProxySelector.getDefault()).connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER).build());
    }
    Channel3Catalog(Catalog curated, String key, String api, HttpClient http) {
        if (key == null || key.isBlank()) throw new IllegalArgumentException("CHANNEL3_API_KEY is required");
        this.curated = curated; this.key = key; this.api = api; this.http = http;
    }
    public List<Offer> offers() { return curated.offers(); }
    public Offer get(String id) { return curated.get(id); }
    public boolean sellsTents() { return true; }

    public List<Offer> offers(Intent intent) {
        if (!"BUY".equals(intent.tentMode())) return curated.offers();
        var catering = curated.offers().stream().filter(o -> o.category() == Category.CATERING).toList();
        // The most a tent can cost and still leave room for the least expensive catering that covers the guests.
        long cheapestMeals = catering.stream().filter(o -> o.capacity() >= intent.attendees())
            .mapToLong(o -> o.unitMinor() * intent.attendees()).min().orElse(0);
        long perTent = Math.max(0, (intent.budgetMinor() - cheapestMeals) / intent.tents());
        var tents = search(intent, perTent);
        if (tents.isEmpty()) throw CommerceException.invalid("Channel3 found no tents to buy within this budget. Raise the budget, or choose Rent tents.");
        var offers = new ArrayList<Offer>(tents); offers.addAll(catering);
        return List.copyOf(offers);
    }

    List<Offer> search(Intent intent, long maxPerTentMinor) {
        var query = "pop-up canopy tent" + (intent.weather() != null && intent.weather().toLowerCase(Locale.ROOT).contains("rain") ? " waterproof" : "");
        var body = Map.of("query", query, "limit", 10, "filters", Map.of("availability", List.of("InStock"),
            "price", Map.of("min_price", 20, "max_price", BigDecimal.valueOf(Math.max(maxPerTentMinor, 2000), 2))));
        var request = HttpRequest.newBuilder(URI.create(api + "/v1/search")).timeout(Duration.ofSeconds(15))
            .header("x-api-key", key).header("Content-Type", "application/json").header("Accept", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(Json.write(body))).build();
        HttpResponse<String> response;
        try { response = http.send(request, HttpResponse.BodyHandlers.ofString()); }
        catch (java.io.IOException e) { throw unavailable(); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw unavailable(); }
        if (response.statusCode() != 200) throw unavailable();
        JsonNode products;
        try { products = Json.MAPPER.readTree(response.body()).path("products"); } catch (Exception e) { throw unavailable(); }
        var merchant = curated.offers().stream().filter(o -> o.category() == Category.TENTS).findFirst().orElseThrow();
        var offers = new ArrayList<Offer>();
        for (var product : products) {
            var id = product.path("id").asText(""); var title = product.path("title").asText("");
            if (id.isBlank() || title.isBlank() || id.length() > 80) continue;
            // The lowest in-stock US-dollar price among the product's stores.
            JsonNode best = null; int compared = 0;
            for (var offer : product.path("offers")) {
                if (!"USD".equals(offer.path("price").path("currency").asText()) || !"InStock".equals(offer.path("availability").asText())
                    || !offer.path("price").path("price").isNumber() || offer.path("domain").asText("").isBlank()) continue;
                compared++;
                if (best == null || offer.path("price").path("price").decimalValue().compareTo(best.path("price").path("price").decimalValue()) < 0) best = offer;
            }
            if (best == null) continue;
            long unitMinor = best.path("price").path("price").decimalValue().setScale(2, RoundingMode.HALF_UP).movePointRight(2).longValueExact();
            if (unitMinor <= 0 || unitMinor > maxPerTentMinor) continue;
            var brand = product.path("brands").path(0).path("name").asText(null);
            var store = best.path("domain").asText();
            // Channel3's reviews, when it has them, and how many in-stock offers the price was chosen from, so the Sourcing Agent can weigh them.
            var rated = product.has("rating") ? product.path("rating") : product.path("ratings");
            Double rating = rated.path("value").isNumber() ? rated.path("value").asDouble() : null;
            Integer reviews = rated.path("count").isInt() ? rated.path("count").asInt() : null;
            String reviewed = rating == null ? "" : String.format(Locale.ROOT, " Rated %.1f of 5%s.", rating, reviews == null ? "" : " from " + reviews + " reviews");
            offers.add(new Offer("c3-" + id, merchant.merchantId(), merchant.merchantName(), Category.TENTS, shorten(title, 120),
                (brand == null ? "" : brand + " · ") + "listed by " + store + ", the lowest of " + compared + " in-stock " + (compared == 1 ? "offer" : "offers") + "." + reviewed
                    + " Product data from Channel3; " + merchant.merchantName() + " fills the order.",
                unitMinor, MAX_TENTS, "Real product", new ProductSource("Channel3", id, brand, store, best.path("url").asText(null), rating, reviews, compared)));
        }
        return offers;
    }
    private static String shorten(String text, int limit) { return text.length() <= limit ? text : text.substring(0, limit - 1) + "…"; }
    private static CommerceException unavailable() {
        return new CommerceException("CATALOG_UNAVAILABLE", "Channel3 couldn't be reached for tents to buy. Try again, or choose Rent tents.", 503);
    }
}
