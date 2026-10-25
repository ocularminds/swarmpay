package com.swarmpay.integrations;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.swarmpay.domain.CommerceException;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;

/** PayPal's verification REST endpoint is not covered by the Server SDK. */
public final class PayPalWebhookVerifier {
    private static final URI SANDBOX=URI.create("https://api-m.sandbox.paypal.com");
    private final Map<String,PayPalPaymentProvider.MerchantAccount> accounts;
    private final URI base;
    private final HttpClient http;
    public PayPalWebhookVerifier(Map<String,PayPalPaymentProvider.MerchantAccount> accounts) {
        this(accounts,SANDBOX,HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build());
    }
    PayPalWebhookVerifier(Map<String,PayPalPaymentProvider.MerchantAccount> accounts,URI base,HttpClient http) {
        this.accounts=Map.copyOf(accounts); this.base=base; this.http=http;
    }
    public JsonNode verify(String merchant,String raw,Map<String,String> headers) {
        var account=accounts.get(merchant);
        if (account==null || raw==null || raw.getBytes(StandardCharsets.UTF_8).length>128000) throw CommerceException.invalid("Invalid webhook");
        var body=new LinkedHashMap<String,Object>();
        var caseInsensitive=new TreeMap<String,String>(String.CASE_INSENSITIVE_ORDER);
        caseInsensitive.putAll(headers);
        for(var pair:Map.of("auth_algo","paypal-auth-algo","cert_url","paypal-cert-url","transmission_id","paypal-transmission-id",
            "transmission_sig","paypal-transmission-sig","transmission_time","paypal-transmission-time").entrySet()) {
            String value=caseInsensitive.get(pair.getValue());
            if(value==null || value.isBlank() || value.length()>4000) throw CommerceException.invalid("Missing PayPal verification headers");
            body.put(pair.getKey(),value);
        }
        JsonNode event;
        try {
            event=Json.MAPPER.readerFor(JsonNode.class).with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readValue(raw);
            if(!event.isObject() || event.path("id").asText().isBlank() || event.path("event_type").asText().isBlank()
                || event.path("resource").path("id").asText().isBlank()) throw new IllegalArgumentException();
        } catch(Exception e) { throw CommerceException.invalid("Invalid PayPal event body"); }
        body.put("webhook_id",account.webhookId()); body.put("webhook_event",event);
        try {
            String basic=Base64.getEncoder().encodeToString((account.clientId()+":"+account.clientSecret()).getBytes(StandardCharsets.UTF_8));
            var oauth=http.send(HttpRequest.newBuilder(base.resolve("/v1/oauth2/token")).timeout(Duration.ofSeconds(15))
                .header("Authorization","Basic "+basic).header("Content-Type","application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString("grant_type=client_credentials")).build(),HttpResponse.BodyHandlers.ofString());
            if(oauth.statusCode()!=200) throw new IllegalStateException("Verification unavailable");
            String token=Json.MAPPER.readTree(oauth.body()).path("access_token").asText();
            if(token.isBlank()) throw new IllegalStateException("Verification unavailable");
            var response=http.send(HttpRequest.newBuilder(base.resolve("/v1/notifications/verify-webhook-signature")).timeout(Duration.ofSeconds(15))
                .header("Authorization","Bearer "+token).header("Content-Type","application/json")
                .POST(HttpRequest.BodyPublishers.ofString(Json.write(body))).build(),HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()!=200) throw new IllegalStateException("Verification unavailable");
            String status=Json.MAPPER.readTree(response.body()).path("verification_status").asText();
            if(status.equals("FAILURE"))
                throw new CommerceException("WEBHOOK_UNVERIFIED","PayPal webhook verification failed",400);
            if(!status.equals("SUCCESS")) throw new IllegalStateException("Verification unavailable");
            return event;
        } catch (CommerceException e) { throw e; }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new CommerceException("WEBHOOK_UNAVAILABLE","Webhook verification unavailable",503); }
        catch (Exception e) { throw new CommerceException("WEBHOOK_UNAVAILABLE","Webhook verification unavailable",503); }
    }
}
