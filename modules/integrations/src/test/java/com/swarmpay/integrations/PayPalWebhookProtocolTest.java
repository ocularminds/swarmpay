package com.swarmpay.integrations;

import com.swarmpay.domain.CommerceException;
import com.swarmpay.integrations.PayPalHttpFixture.Response;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class PayPalWebhookProtocolTest {
    final String event=Json.write(Map.of("id","EVENT1","event_type","PAYMENT.CAPTURE.COMPLETED","resource",Map.of("id","CAPTURE1","amount",Map.of("currency_code","USD","value","500.00"))));
    final Map<String,String> headers=Map.of("paypal-auth-algo","SHA256withRSA","paypal-cert-url","https://api.sandbox.paypal.com/v1/notifications/certs/FIXTURE",
        "paypal-transmission-id","transmission-1","paypal-transmission-sig","fixture-signature","paypal-transmission-time","2026-10-25T12:00:00Z");
    PayPalHttpFixture http;
    PayPalWebhookVerifier verifier;
    @BeforeEach void start() throws Exception {
        http=new PayPalHttpFixture();
        var accounts=Map.of("tents",new PayPalPaymentProvider.MerchantAccount("tent-client","tent-secret","TENTSELLER","tent-webhook"),
            "catering",new PayPalPaymentProvider.MerchantAccount("catering-client","catering-secret","FOODSELLER","catering-webhook"));
        verifier=new PayPalWebhookVerifier(accounts,http.base(),HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build());
        http.handler=r->r.path().equals("/v1/oauth2/token") ? PayPalHttpFixture.oauth() : new Response(200,Map.of("verification_status","SUCCESS"));
    }
    @AfterEach void stop() { http.close(); }

    @Test void bindsTheOriginalEventAndHeadersToTheSelectedMerchantsWebhook() throws Exception {
        var mixedCase=new HashMap<String,String>(); headers.forEach((name,value)->mixedCase.put(name.toUpperCase(Locale.ROOT),value));
        var verified=verifier.verify("catering",event,mixedCase);
        assertEquals(Json.MAPPER.readTree(event),verified);
        assertEquals(2,http.requests.size());
        var oauth=http.requests.getFirst();
        assertEquals("Basic "+Base64.getEncoder().encodeToString("catering-client:catering-secret".getBytes(StandardCharsets.UTF_8)),oauth.header("Authorization"));
        var verification=http.requests.get(1);
        assertEquals("/v1/notifications/verify-webhook-signature",verification.path());
        assertEquals("Bearer fixture-token",verification.header("Authorization"));
        var body=Json.MAPPER.readTree(verification.body());
        assertEquals("catering-webhook",body.path("webhook_id").asText());
        assertEquals(verified,body.path("webhook_event"));
        assertEquals(headers.get("paypal-transmission-sig"),body.path("transmission_sig").asText());
        assertEquals(headers.get("paypal-transmission-id"),body.path("transmission_id").asText());
        assertEquals(headers.get("paypal-cert-url"),body.path("cert_url").asText());
        assertEquals(headers.get("paypal-transmission-time"),body.path("transmission_time").asText());
        assertEquals(headers.get("paypal-auth-algo"),body.path("auth_algo").asText());
    }

    @ParameterizedTest @ValueSource(strings={"missing-header","empty-header","oversized-header","invalid-json","trailing-json","missing-resource","oversized-body","unknown-merchant"})
    void malformedNotificationsNeverObtainAnOAuthToken(String invalid) {
        var changedHeaders=new HashMap<>(headers);
        String raw=event, merchant="tents";
        switch(invalid) {
            case "missing-header" -> changedHeaders.remove("paypal-transmission-sig");
            case "empty-header" -> changedHeaders.put("paypal-transmission-sig","  ");
            case "oversized-header" -> changedHeaders.put("paypal-transmission-sig","x".repeat(4001));
            case "invalid-json" -> raw="{";
            case "trailing-json" -> raw=event+" {}";
            case "missing-resource" -> raw="{\"id\":\"EVENT\",\"event_type\":\"PAYMENT.CAPTURE.COMPLETED\"}";
            case "oversized-body" -> raw="é".repeat(64001);
            case "unknown-merchant" -> merchant="unconfigured";
        }
        final String body=raw, seller=merchant;
        assertEquals(400,assertThrows(CommerceException.class,()->verifier.verify(seller,body,changedHeaders)).status());
        assertTrue(http.requests.isEmpty());
    }

    @Test void explicitSignatureFailureIsRejected() {
        http.handler=r->r.path().equals("/v1/oauth2/token") ? PayPalHttpFixture.oauth() : new Response(200,Map.of("verification_status","FAILURE"));
        var failure=assertThrows(CommerceException.class,()->verifier.verify("tents",event,headers));
        assertEquals("WEBHOOK_UNVERIFIED",failure.code()); assertEquals(400,failure.status());
    }

    @ParameterizedTest @ValueSource(ints={401,429,500,503})
    void providerOutageRemainsRetryableRatherThanInvalidatingTheSignature(int status) {
        http.handler=r->r.path().equals("/v1/oauth2/token") ? PayPalHttpFixture.oauth() : new Response(status,Map.of());
        var failure=assertThrows(CommerceException.class,()->verifier.verify("tents",event,headers));
        assertEquals("WEBHOOK_UNAVAILABLE",failure.code()); assertEquals(503,failure.status());
    }

    @Test void absentTokenCannotBeUsedForVerification() {
        http.handler=r->new Response(200,Map.of());
        assertEquals(503,assertThrows(CommerceException.class,()->verifier.verify("tents",event,headers)).status());
        assertEquals(1,http.requests.size());
    }

    @Test void unexpectedVerificationResponseDoesNotCountAsSuccess() {
        http.handler=r->r.path().equals("/v1/oauth2/token") ? PayPalHttpFixture.oauth() : new Response(200,Map.of("verification_status","UNKNOWN"));
        assertEquals(503,assertThrows(CommerceException.class,()->verifier.verify("tents",event,headers)).status());
    }

    @Test void oauthRedirectDoesNotForwardTheSellerSecret() {
        http.handler=r->new Response(307,Map.of(),Map.of("Location",http.base()+"/unexpected"));
        assertEquals(503,assertThrows(CommerceException.class,()->verifier.verify("tents",event,headers)).status());
        assertEquals(1,http.requests.size());
        assertEquals("/v1/oauth2/token",http.requests.getFirst().path());
    }
}
