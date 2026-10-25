package com.swarmpay.integrations;

import com.fasterxml.jackson.databind.JsonNode;
import com.paypal.sdk.ApiHelper;
import com.paypal.sdk.Environment;
import com.paypal.sdk.PaypalServerSdkClient;
import com.paypal.sdk.authentication.ClientCredentialsAuthModel;
import com.paypal.sdk.exceptions.ApiException;
import com.paypal.sdk.models.*;
import com.swarmpay.domain.Commerce.*;
import com.swarmpay.domain.Commerce.Plan;
import com.swarmpay.domain.CommerceException;
import com.swarmpay.domain.Money;
import java.io.IOException;
import java.util.*;
import java.util.function.Function;

/** Official PayPal Server SDK adapter. Deliberately supports sandbox only. */
public final class PayPalPaymentProvider implements PaymentProvider {
    public record MerchantAccount(String clientId, String clientSecret, String merchantId, String webhookId) {
        public MerchantAccount {
            if (clientId == null || clientId.isBlank() || clientSecret == null || clientSecret.isBlank()
                || merchantId == null || merchantId.isBlank() || webhookId == null || webhookId.isBlank())
                throw new IllegalStateException("Each sandbox merchant needs client credentials, merchant ID and webhook ID");
        }
        @Override public String toString() { return "MerchantAccount[redacted]"; }
    }
    private final Map<String, MerchantAccount> accounts;
    private final Map<String, PaypalServerSdkClient> clients;
    private final Function<UUID,String> orderLookup;
    public PayPalPaymentProvider(Map<String,MerchantAccount> accounts, Function<UUID,String> orderLookup) {
        this.accounts = Map.copyOf(accounts); this.orderLookup = orderLookup;
        var builders = new HashMap<String, PaypalServerSdkClient>();
        accounts.forEach((id,a) -> builders.put(id, new PaypalServerSdkClient.Builder().environment(Environment.SANDBOX)
            .clientCredentialsAuth(new ClientCredentialsAuthModel.Builder(a.clientId(),a.clientSecret()).build())
            .httpClientConfig(c -> c.timeout(20000).numberOfRetries(0)).build()));
        clients = Map.copyOf(builders);
    }
    @Override public ProviderResult execute(PaymentCommand c, Plan plan, Line line) {
        var client = client(c.merchantId());
        var account = accounts.get(c.merchantId());
        try {
            if (c.operation() == Operation.CREATE_ORDER) {
                var amount = Map.of("currency_code","USD","value",Money.usd(c.amountMinor()).decimal());
                var purchase = Map.of("reference_id",c.orderId().toString(),"custom_id",c.orderId().toString(),
                    "invoice_id",c.orderId().toString(),"description",line.title(),"amount",amount,
                    "payee",Map.of("merchant_id",account.merchantId()));
                var body = ApiHelper.deserialize(Json.write(Map.of("intent",line.paymentIntent(),"purchase_units",List.of(purchase))), OrderRequest.class);
                var result = client.getOrdersController().createOrder(new CreateOrderInput.Builder(null,body)
                    .paypalRequestId(c.requestId()).prefer("return=representation").build());
                var node = tree(result.getResult());
                verifyOrder(node,c,account.merchantId());
                return readOrder(node,c);
            }
            String orderId = c.operation() == Operation.CAPTURE_ORDER || c.operation() == Operation.AUTHORIZE_ORDER
                ? c.providerResourceId() : orderLookup.apply(c.orderId());
            if (orderId == null) throw CommerceException.held("The provider order must be reconciled first");
            var order = getOrder(client,orderId);
            verifyOrder(order,c,account.merchantId());
            return switch (c.operation()) {
                case CAPTURE_ORDER -> readOrder(tree(client.getOrdersController().captureOrder(new CaptureOrderInput.Builder(orderId,null)
                    .paypalRequestId(c.requestId()).prefer("return=representation").build()).getResult()),c);
                case AUTHORIZE_ORDER -> readOrder(tree(client.getOrdersController().authorizeOrder(new AuthorizeOrderInput.Builder(orderId,null)
                    .paypalRequestId(c.requestId()).prefer("return=representation").build()).getResult()),c);
                case CAPTURE_AUTHORIZATION -> {
                    verifyAuthorization(order,c);
                    var request = new CaptureRequest.Builder().amount(new com.paypal.sdk.models.Money.Builder("USD",Money.usd(c.amountMinor()).decimal()).build()).finalCapture(true).build();
                    var capture = tree(client.getPaymentsController().captureAuthorizedPayment(new CaptureAuthorizedPaymentInput.Builder(c.providerResourceId(),null)
                        .body(request).paypalRequestId(c.requestId()).prefer("return=representation").build()).getResult());
                    verifyAmount(capture.path("amount"),c);
                    yield new ProviderResult(captureStatus(capture.path("status").asText()),
                        orderId,c.providerResourceId(),capture.path("id").asText(null),null,c.amountMinor(),c.currency(),c.merchantId(),"PAYPAL_SANDBOX");
                }
                case VOID_AUTHORIZATION -> {
                    verifyAuthorization(order,c);
                    client.getPaymentsController().voidPayment(new VoidPaymentInput.Builder(c.providerResourceId()).paypalRequestId(c.requestId()).build());
                    var auth = tree(client.getPaymentsController().getAuthorizedPayment(new GetAuthorizedPaymentInput.Builder(c.providerResourceId()).build()).getResult());
                    yield new ProviderResult(auth.path("status").asText().equals("VOIDED") ? "VOIDED" : "PENDING",orderId,c.providerResourceId(),null,null,c.amountMinor(),c.currency(),c.merchantId(),"PAYPAL_SANDBOX");
                }
                default -> throw CommerceException.invalid("Unsupported operation");
            };
        } catch (ApiException e) {
            if (e.getResponseCode() >= 400 && e.getResponseCode() < 500)
                throw new CommerceException("PAYPAL_REFUSED","PayPal refused the request (HTTP " + e.getResponseCode() + "). Review the sandbox payment before retrying.",422);
            throw new ProviderUncertainException();
        } catch (IOException e) { throw new ProviderUncertainException(); }
    }
    @Override public ProviderResult reconcile(PaymentCommand c) {
        String order = c.operation() == Operation.AUTHORIZE_ORDER || c.operation() == Operation.CAPTURE_ORDER
            ? c.providerResourceId() : orderLookup.apply(c.orderId());
        if (order == null) return null;
        try {
            var node = getOrder(client(c.merchantId()),order);
            verifyOrder(node,c,accounts.get(c.merchantId()).merchantId());
            var result = readOrder(node,c);
            return switch(c.operation()) {
                case CREATE_ORDER -> result;
                case CAPTURE_ORDER, CAPTURE_AUTHORIZATION -> Set.of("CAPTURED","DECLINED","EXPIRED","VOIDED").contains(result.status()) ? result : null;
                case AUTHORIZE_ORDER -> Set.of("AUTHORIZED","CAPTURED","DECLINED","EXPIRED","VOIDED").contains(result.status()) ? result : null;
                case VOID_AUTHORIZATION -> {
                    var auth = tree(client(c.merchantId()).getPaymentsController().getAuthorizedPayment(new GetAuthorizedPaymentInput.Builder(c.providerResourceId()).build()).getResult());
                    yield auth.path("status").asText().equals("VOIDED") ? new ProviderResult("VOIDED",order,c.providerResourceId(),null,null,c.amountMinor(),c.currency(),c.merchantId(),"PAYPAL_SANDBOX") : null;
                }
            };
        } catch (Exception e) { return null; }
    }
    private PaypalServerSdkClient client(String merchant) {
        var client = clients.get(merchant);
        if (client == null) throw CommerceException.held("Merchant is not configured");
        return client;
    }
    private JsonNode getOrder(PaypalServerSdkClient client, String id) throws IOException, ApiException {
        return tree(client.getOrdersController().getOrder(new GetOrderInput.Builder(id).build()).getResult());
    }
    private static JsonNode tree(Object object) throws IOException { return Json.MAPPER.readTree(ApiHelper.serialize(object)); }
    public static void verifyOrder(JsonNode order, PaymentCommand c, String payee) {
        var units = order.path("purchase_units");
        if (!units.isArray() || units.size()!=1) throw CommerceException.held("Provider order must contain exactly one merchant");
        var unit = units.get(0);
        if (!payee.equals(unit.path("payee").path("merchant_id").asText())
            || !c.orderId().toString().equals(unit.path("custom_id").asText())) throw CommerceException.held("Provider order payee or contract does not match");
        verifyAmount(unit.path("amount"),c);
    }
    private static void verifyAuthorization(JsonNode order, PaymentCommand c) {
        boolean found = false;
        for (var auth : order.path("purchase_units").get(0).path("payments").path("authorizations")) {
            if (c.providerResourceId().equals(auth.path("id").asText())) { verifyAmount(auth.path("amount"),c); found = true; }
        }
        if (!found) throw CommerceException.held("Authorization does not belong to the approved provider order");
    }
    public static void verifyAmount(JsonNode amount, PaymentCommand c) {
        if (!c.currency().equals(amount.path("currency_code").asText())
            || Money.fromDecimal(amount.path("value").asText()).minor()!=c.amountMinor())
            throw CommerceException.held("Provider amount does not match the approved amount");
    }
    public static ProviderResult readOrder(JsonNode node, PaymentCommand c) {
        var payments = node.path("purchase_units").path(0).path("payments");
        String authId=null, captureId=null, status="APPROVAL_REQUIRED", approval=null;
        for (var auth : payments.path("authorizations")) {
            verifyAmount(auth.path("amount"),c);
            authId=auth.path("id").asText(null);
            status = switch(auth.path("status").asText()) {
                case "CREATED" -> "AUTHORIZED";
                case "VOIDED" -> "VOIDED";
                case "DENIED", "DECLINED" -> "DECLINED";
                case "EXPIRED" -> "EXPIRED";
                default -> "PENDING";
            };
        }
        for (var cap : payments.path("captures")) {
            verifyAmount(cap.path("amount"),c);
            captureId=cap.path("id").asText(null);
            status = captureStatus(cap.path("status").asText());
        }
        for (var link : node.path("links")) if ("approve".equals(link.path("rel").asText()) || "payer-action".equals(link.path("rel").asText())) approval=link.path("href").asText(null);
        return new ProviderResult(status,node.path("id").asText(null),authId,captureId,approval,c.amountMinor(),c.currency(),c.merchantId(),"PAYPAL_SANDBOX");
    }
    private static String captureStatus(String status) {
        return switch(status) {
            case "COMPLETED" -> "CAPTURED";
            case "DECLINED", "DENIED", "FAILED" -> "DECLINED";
            default -> "PENDING";
        };
    }
    public static final class ProviderUncertainException extends RuntimeException {
        public ProviderUncertainException() { super("PayPal outcome is uncertain; reconcile before retrying"); }
    }
}
