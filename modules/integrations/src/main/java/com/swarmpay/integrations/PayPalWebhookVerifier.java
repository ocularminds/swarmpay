package com.swarmpay.integrations;

import com.fasterxml.jackson.databind.JsonNode;
import com.swarmpay.domain.CommerceException;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;

/** PayPal's verification REST endpoint is not covered by the Server SDK. */
public final class PayPalWebhookVerifier {
    private static final String BASE="https://api-m.sandbox.paypal.com";
    private final Map<String,PayPalPaymentProvider.MerchantAccount> accounts;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
    public PayPalWebhookVerifier(Map<String,PayPalPaymentProvider.MerchantAccount> accounts) { this.accounts=Map.copyOf(accounts); }
    public JsonNode verify(String merchant,String raw,Map<String,String> headers) {
        var account=accounts.get(merchant);
        if (account==null || raw.length()>128000) throw CommerceException.invalid("Invalid webhook");
        try {
            String basic=Base64.getEncoder().encodeToString((account.clientId()+":"+account.clientSecret()).getBytes(StandardCharsets.UTF_8));
            var oauth=http.send(HttpRequest.newBuilder(URI.create(BASE+"/v1/oauth2/token")).timeout(Duration.ofSeconds(15))
                .header("Authorization","Basic "+basic).header("Content-Type","application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString("grant_type=client_credentials")).build(),HttpResponse.BodyHandlers.ofString());
            if(oauth.statusCode()!=200) throw new IllegalStateException("Verification unavailable");
            String token=Json.MAPPER.readTree(oauth.body()).path("access_token").asText();
            var event=Json.MAPPER.readTree(raw);
            var body=new LinkedHashMap<String,Object>();
            for(var pair:Map.of("auth_algo","paypal-auth-algo","cert_url","paypal-cert-url","transmission_id","paypal-transmission-id",
                "transmission_sig","paypal-transmission-sig","transmission_time","paypal-transmission-time").entrySet()) {
                String value=headers.get(pair.getValue());
                if(value==null || value.length()>4000) throw CommerceException.invalid("Missing PayPal verification headers");
                body.put(pair.getKey(),value);
            }
            body.put("webhook_id",account.webhookId()); body.put("webhook_event",event);
            var response=http.send(HttpRequest.newBuilder(URI.create(BASE+"/v1/notifications/verify-webhook-signature")).timeout(Duration.ofSeconds(15))
                .header("Authorization","Bearer "+token).header("Content-Type","application/json")
                .POST(HttpRequest.BodyPublishers.ofString(Json.write(body))).build(),HttpResponse.BodyHandlers.ofString());
            if (response.statusCode()!=200 || !"SUCCESS".equals(Json.MAPPER.readTree(response.body()).path("verification_status").asText()))
                throw new CommerceException("WEBHOOK_UNVERIFIED","PayPal webhook verification failed",400);
            return event;
        } catch (CommerceException e) { throw e; }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new CommerceException("WEBHOOK_UNAVAILABLE","Webhook verification unavailable",503); }
        catch (Exception e) { throw new CommerceException("WEBHOOK_UNAVAILABLE","Webhook verification unavailable",503); }
    }
}
