package com.swarmpay.integrations;

import com.swarmpay.domain.Commerce.*;
import com.swarmpay.domain.CommerceException;
import com.swarmpay.domain.PlanFactory;
import com.swarmpay.integrations.PayPalHttpFixture.Response;
import org.junit.jupiter.api.*;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class Channel3CatalogTest {
    PayPalHttpFixture channel3;
    Channel3Catalog catalog;
    Intent buy(long budget) { return new Intent("Buy tents",30,5,budget,Instant.now().plusSeconds(3600),"UTC","Riverside Pavilion","Rain expected","BUY"); }
    static Map<String,Object> product(String id,String title,Object... offers) {
        return Map.of("id",id,"title",title,"brands",List.of(Map.of("id","b1","name","Shade Co")),"offers",List.of(offers));
    }
    static Map<String,Object> offer(String domain,double price,String currency,String availability) {
        return Map.of("url","https://"+domain+"/p","domain",domain,"price",Map.of("price",price,"currency",currency),"availability",availability);
    }
    @BeforeEach void start() throws Exception {
        channel3=new PayPalHttpFixture();
        catalog=new Channel3Catalog(new DemoCatalog(),"c3-test-key",channel3.base().toString(),HttpClient.newHttpClient());
    }
    @AfterEach void stop() { channel3.close(); }

    @Test void buyingSearchesInStockTentsThatLeaveRoomForCateringAndKeepsTheLowestUsdPrice() {
        channel3.handler=r->new Response(200,Map.of("products",List.of(
            product("p1","10x10 pop-up canopy",offer("store-a.example",119.99,"USD","InStock"),offer("store-b.example",99.5,"USD","InStock"),offer("store-c.example",80,"EUR","InStock")),
            product("p2","Sold-out canopy",offer("store-a.example",90,"USD","OutOfStock")),
            product("p3","Too expensive canopy",offer("store-a.example",400,"USD","InStock")))));
        var offers=catalog.offers(buy(150000));
        var request=channel3.requests.getFirst();
        assertEquals("/v1/search",request.path());assertEquals("c3-test-key",request.header("x-api-key"));
        var sent=Json.read(request.body(),Map.class);
        assertEquals("pop-up canopy tent waterproof",sent.get("query"));
        // $1,500 less the cheapest catering for 30 guests ($900), over five tents: at most $120 each.
        assertEquals(Map.of("availability",List.of("InStock"),"price",Map.of("min_price",20,"max_price",120.0)),sent.get("filters"));
        var tents=offers.stream().filter(o->o.category()==Category.TENTS).toList();
        assertEquals(1,tents.size(),"out-of-stock, non-USD-only and over-budget products are left out");
        var tent=tents.getFirst();
        assertEquals("c3-p1",tent.id());assertEquals(9950,tent.unitMinor());assertEquals("Canopy Collective",tent.merchantName());
        assertEquals(new ProductSource("Channel3","p1","Shade Co","store-b.example","https://store-b.example/p"),tent.source());
        assertTrue(offers.stream().anyMatch(o->o.category()==Category.CATERING),"catering stays curated");
        // The plan records where the product came from; the tents merchant is still the PayPal payee.
        var plan=new PlanFactory(Clock.systemUTC()).create("organizer",buy(150000),tent,new DemoCatalog().get("catering-seasonal"),List.of());
        assertEquals(49750,plan.lines().getFirst().totalMinor());assertEquals("tents",plan.lines().getFirst().merchantId());
        assertEquals("Channel3",plan.lines().getFirst().source().provider());
    }

    @Test void rentalsNeverCallChannel3() {
        var rent=new Intent("Rent tents",30,5,150000,Instant.now().plusSeconds(3600),"UTC","Riverside Pavilion","","RENT");
        assertEquals(new DemoCatalog().offers(),catalog.offers(rent));
        assertTrue(channel3.requests.isEmpty());
    }

    @Test void anUnavailableOrEmptySearchFailsClosedWithAWayForward() {
        channel3.handler=r->new Response(503,Map.of());
        assertEquals("CATALOG_UNAVAILABLE",assertThrows(CommerceException.class,()->catalog.offers(buy(150000))).code());
        channel3.handler=r->new Response(200,Map.of("products",List.of()));
        assertTrue(assertThrows(CommerceException.class,()->catalog.offers(buy(150000))).getMessage().contains("choose Rent tents"));
    }

    @Test void withoutChannel3BuyingIsRefusedAndRentingIsUnchanged() {
        var demo=new DemoCatalog();
        assertFalse(demo.sellsTents());
        assertThrows(CommerceException.class,()->demo.offers(buy(150000)));
        assertThrows(IllegalArgumentException.class,()->new Channel3Catalog(demo," "));
    }
}
