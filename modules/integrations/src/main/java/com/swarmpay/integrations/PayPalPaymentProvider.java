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
import io.apimatic.core.exceptions.AuthValidationException;
import java.io.IOException;
import java.time.*;
import java.util.*;
import java.util.function.Function;
import okhttp3.OkHttpClient;

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
    private final Clock clock;
    public PayPalPaymentProvider(Map<String,MerchantAccount> accounts, Function<UUID,String> orderLookup) {
        this(accounts,orderLookup,sandboxHttpClient());
    }
    PayPalPaymentProvider(Map<String,MerchantAccount> accounts, Function<UUID,String> orderLookup, OkHttpClient transport) {
        this(accounts,orderLookup,transport,Clock.systemUTC());
    }
    PayPalPaymentProvider(Map<String,MerchantAccount> accounts, Function<UUID,String> orderLookup, OkHttpClient transport, Clock clock) {
        this.accounts = Map.copyOf(accounts); this.orderLookup = orderLookup; this.clock=clock;
        var builders = new HashMap<String, PaypalServerSdkClient>();
        accounts.forEach((id,a) -> builders.put(id, new PaypalServerSdkClient.Builder().environment(Environment.SANDBOX)
            .clientCredentialsAuth(new ClientCredentialsAuthModel.Builder(a.clientId(),a.clientSecret()).build())
            // The SDK timeout is in seconds. Supplying our transport without overrides also
            // avoids the adapter's redirect interceptor and OkHttp's connection retry default.
            .httpClientConfig(c -> c.timeout(20).numberOfRetries(0).shouldRetryOnTimeout(false)
                .httpClientInstance(transport,false)).build()));
        clients = Map.copyOf(builders);
    }
    static OkHttpClient sandboxHttpClient() {
        return new OkHttpClient.Builder().connectTimeout(Duration.ofSeconds(5))
            .readTimeout(Duration.ofSeconds(20)).writeTimeout(Duration.ofSeconds(20)).callTimeout(Duration.ofSeconds(20))
            .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false).build();
    }
    @Override public ProviderResult execute(PaymentCommand c, Plan plan, Line line) { return execute(c,plan,line,0); }
    /**
     * After PayPal declines the buyer's funding source, the buyer approves the same order
     * again with another one. That approval is a new provider request for the same command:
     * PayPal took no payment, and it captures or authorizes an order only once.
     */
    @Override public ProviderResult execute(PaymentCommand c, Plan plan, Line line, int buyerAttempt) {
        boolean buyerStep = c.operation() == Operation.CAPTURE_ORDER || c.operation() == Operation.AUTHORIZE_ORDER;
        if (buyerAttempt < 0 || buyerAttempt > 0 && !buyerStep) throw new IllegalArgumentException("Only a buyer approval can be attempted again");
        String requestId = buyerAttempt == 0 ? c.requestId() : c.requestId() + "-buyer-" + buyerAttempt;
        var client = client(c.merchantId());
        var account = accounts.get(c.merchantId());
        boolean effectAttempted=false, providerAccepted=false;
        try {
            if (c.operation() == Operation.CREATE_ORDER) {
                var amount = Map.of("currency_code","USD","value",Money.usd(c.amountMinor()).decimal());
                var purchase = Map.of("reference_id",c.orderId().toString(),"custom_id",c.orderId().toString(),
                    "invoice_id",c.orderId().toString(),"description",line.title(),"amount",amount,
                    "payee",Map.of("merchant_id",account.merchantId()));
                var body = ApiHelper.deserialize(Json.write(Map.of("intent",line.paymentIntent(),"purchase_units",List.of(purchase))), OrderRequest.class);
                effectAttempted=true;
                var result = client.getOrdersController().createOrder(new CreateOrderInput.Builder(null,body)
                    .paypalRequestId(c.requestId()).prefer("return=representation").build());
                providerAccepted=true;
                var node = tree(result.getResult());
                verifyOrder(node,c,account.merchantId());
                verifyIntent(node,line.paymentIntent());
                return readOrder(node,c,clock.instant());
            }
            String orderId = c.operation() == Operation.CAPTURE_ORDER || c.operation() == Operation.AUTHORIZE_ORDER
                ? c.providerResourceId() : orderLookup.apply(c.orderId());
            if (orderId == null || orderId.isBlank()) throw CommerceException.held("The provider order must be reconciled first");
            var order = getOrder(client,orderId);
            verifyOrder(order,c,account.merchantId());
            verifyId(order,orderId);
            verifyIntent(order,line.paymentIntent());
            readOrder(order,c,clock.instant());
            if (c.operation()==Operation.CAPTURE_AUTHORIZATION || c.operation()==Operation.VOID_AUTHORIZATION)
                verifyAuthorization(order,c);
            effectAttempted=true;
            return switch (c.operation()) {
                case CAPTURE_ORDER -> {
                    var response=client.getOrdersController().captureOrder(new CaptureOrderInput.Builder(orderId,null)
                        .paypalRequestId(requestId).prefer("return=representation").build());
                    providerAccepted=true;
                    yield readReturnedOrder(tree(response.getResult()),c,account.merchantId(),line.paymentIntent(),orderId,client);
                }
                case AUTHORIZE_ORDER -> {
                    var response=client.getOrdersController().authorizeOrder(new AuthorizeOrderInput.Builder(orderId,null)
                        .paypalRequestId(requestId).prefer("return=representation").build());
                    providerAccepted=true;
                    yield readReturnedOrder(tree(response.getResult()),c,account.merchantId(),line.paymentIntent(),orderId,client);
                }
                case CAPTURE_AUTHORIZATION -> {
                    var request = new CaptureRequest.Builder().amount(new com.paypal.sdk.models.Money.Builder("USD",Money.usd(c.amountMinor()).decimal()).build()).finalCapture(true).build();
                    var response=client.getPaymentsController().captureAuthorizedPayment(new CaptureAuthorizedPaymentInput.Builder(c.providerResourceId(),null)
                        .body(request).paypalRequestId(c.requestId()).prefer("return=representation").build());
                    providerAccepted=true;
                    var capture=tree(response.getResult());
                    verifyPayment(capture,c,account.merchantId(),orderId,c.providerResourceId(),null);
                    yield captureResult(capture,c,orderId,c.providerResourceId());
                }
                case VOID_AUTHORIZATION -> {
                    client.getPaymentsController().voidPayment(new VoidPaymentInput.Builder(c.providerResourceId()).paypalRequestId(c.requestId()).build());
                    providerAccepted=true;
                    var auth = tree(client.getPaymentsController().getAuthorizedPayment(new GetAuthorizedPaymentInput.Builder(c.providerResourceId()).build()).getResult());
                    verifyPayment(auth,c,account.merchantId(),orderId,c.providerResourceId(),c.providerResourceId());
                    yield result(c,auth.path("status").asText().equals("VOIDED") ? "VOIDED" : "PENDING",orderId,c.providerResourceId(),null);
                }
                default -> throw CommerceException.invalid("Unsupported operation");
            };
        } catch (ApiException e) {
            if (!providerAccepted && buyerStep && buyerCanChooseAgain(e)) throw new BuyerActionRequiredException();
            if (!providerAccepted && definitiveRefusal(e))
                throw new CommerceException("PAYPAL_REFUSED","PayPal refused the request (HTTP " + e.getResponseCode() + "). Review the sandbox payment before retrying.",422);
            if (retrySafe(c,effectAttempted,providerAccepted)) throw new ProviderNotDispatchedException();
            throw new ProviderUncertainException();
        } catch (CommerceException e) {
            // A bad response after dispatch cannot prove that the payment did not happen.
            if (effectAttempted) throw new ProviderUncertainException();
            throw e;
        } catch (IOException e) {
            if (retrySafe(c,effectAttempted,providerAccepted)) throw new ProviderNotDispatchedException();
            throw new ProviderUncertainException();
        } catch (AuthValidationException e) {
            // The SDK raises this when it has no OAuth token, before it builds any request.
            throw new ProviderNotDispatchedException();
        }
    }
    /**
     * Nothing that moves money was sent: the failure came from an order read before the
     * payment POST, or from creating an order, which needs buyer approval before any funds move and
     * which PayPal deduplicates by the same PayPal-Request-Id on retry.
     */
    private static boolean retrySafe(PaymentCommand c,boolean effectAttempted,boolean providerAccepted) {
        return !effectAttempted || c.operation()==Operation.CREATE_ORDER && !providerAccepted;
    }
    @Override public ProviderResult reconcile(PaymentCommand c, ProviderResult known) {
        String order = c.operation() == Operation.AUTHORIZE_ORDER || c.operation() == Operation.CAPTURE_ORDER
            ? c.providerResourceId() : known!=null ? known.providerOrderId() : orderLookup.apply(c.orderId());
        if (order == null) return null;
        try {
            var client=client(c.merchantId());
            var payee=accounts.get(c.merchantId()).merchantId();
            var node=getOrder(client,order);
            verifyOrder(node,c,payee); verifyId(node,order);
            if(c.operation()!=Operation.CREATE_ORDER)
                verifyIntent(node,c.operation()==Operation.CAPTURE_ORDER ? "CAPTURE" : "AUTHORIZE");
            var observed=readOrder(node,c,clock.instant());
            if(c.operation()==Operation.CREATE_ORDER) return observed;

            boolean usesAuthorization=c.operation()==Operation.CAPTURE_AUTHORIZATION || c.operation()==Operation.VOID_AUTHORIZATION;
            if(usesAuthorization) verifyAuthorization(node,c);
            String authId=usesAuthorization ? c.providerResourceId() : known!=null && known.authorizationId()!=null ? known.authorizationId() : observed.authorizationId();
            String captureId=known!=null && known.captureId()!=null ? known.captureId() : observed.captureId();
            // Orders may lag a Payments resource. Keep a recorded capture ID and read that
            // resource directly, without issuing another POST or inventing a new request ID.
            if(captureId!=null) {
                var capture=tree(client.getPaymentsController().getCapturedPayment(new GetCapturedPaymentInput.Builder(captureId).build()).getResult());
                verifyPayment(capture,c,payee,order,authId,captureId);
                return captureResult(capture,c,order,authId);
            }
            if(authId!=null) {
                var auth=tree(client.getPaymentsController().getAuthorizedPayment(new GetAuthorizedPaymentInput.Builder(authId).build()).getResult());
                verifyPayment(auth,c,payee,order,authId,authId);
                String status=authorizationStatus(auth,clock.instant());
                if(c.operation()==Operation.AUTHORIZE_ORDER || Set.of("VOIDED","EXPIRED","DECLINED").contains(status))
                    return result(c,status,order,authId,null);
            }
            return Set.of("VOIDED","EXPIRED","DECLINED").contains(observed.status()) ? observed : null;
        } catch (Exception e) { return null; }
    }
    private static boolean definitiveRefusal(ApiException e) {
        if(Set.of(400,401,403,404,405,406,415).contains(e.getResponseCode())) return true;
        var found=issues(e);
        return e.getResponseCode()==422 && !found.isEmpty() && Set.of("INSTRUMENT_DECLINED","PAYER_CANNOT_PAY","TRANSACTION_REFUSED").containsAll(found);
    }
    /** PayPal declined the funding source the buyer chose; PayPal's checkout lets them choose another for the same order. */
    private static boolean buyerCanChooseAgain(ApiException e) {
        var found=issues(e);
        return e.getResponseCode()==422 && !found.isEmpty() && Set.of("INSTRUMENT_DECLINED","PAYER_ACTION_REQUIRED").containsAll(found);
    }
    private static Set<String> issues(ApiException e) {
        try {
            var found=new HashSet<String>();
            for(var detail:Json.MAPPER.readTree(e.getHttpContext().getResponse().getBody()).path("details")) found.add(detail.path("issue").asText());
            return found;
        } catch(Exception ignored) { return Set.of(); }
    }
    private ProviderResult readReturnedOrder(JsonNode node,PaymentCommand c,String payee,String intent,String id,PaypalServerSdkClient client) throws IOException,ApiException {
        verifyId(node,id);
        var units=node.path("purchase_units");
        if(!units.isArray() || units.size()!=1) throw CommerceException.held("Provider order must contain exactly one merchant");
        var unit=units.get(0);
        verifyOptional(unit.path("payee"),"merchant_id",payee);
        verifyOptional(unit,"custom_id",c.orderId().toString());
        verifyOptional(unit,"reference_id",c.orderId().toString());
        verifyOptional(unit,"invoice_id",c.orderId().toString());
        verifyOptional(node,"intent",intent);
        if(unit.hasNonNull("amount")) verifyAmount(unit.path("amount"),c);
        readOrder(node,c,clock.instant());
        // PayPal can omit contract fields in an authorize/capture response even with
        // return=representation. Confirm the full order before accepting that result.
        if(!unit.path("payee").hasNonNull("merchant_id") || !unit.hasNonNull("custom_id") || !unit.hasNonNull("amount") || !node.hasNonNull("intent")) {
            node=getOrder(client,id);
            verifyId(node,id);
        }
        verifyOrder(node,c,payee); verifyIntent(node,intent);
        var observed=readOrder(node,c,clock.instant());
        if(observed.status().equals("APPROVAL_REQUIRED")) throw new ProviderUncertainException();
        return observed;
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
        verifyId(order,null);
        var units = order.path("purchase_units");
        if (!units.isArray() || units.size()!=1) throw CommerceException.held("Provider order must contain exactly one merchant");
        var unit = units.get(0);
        if (!payee.equals(unit.path("payee").path("merchant_id").asText())
            || !c.orderId().toString().equals(unit.path("custom_id").asText())) throw CommerceException.held("Provider order payee or contract does not match");
        verifyOptional(unit,"reference_id",c.orderId().toString());
        verifyOptional(unit,"invoice_id",c.orderId().toString());
        verifyAmount(unit.path("amount"),c);
    }
    private static void verifyId(JsonNode node,String expected) {
        String id=node.path("id").asText();
        if(id.isBlank() || expected!=null && !expected.equals(id)) throw CommerceException.held("Provider resource identity does not match");
    }
    private static void verifyIntent(JsonNode order,String intent) {
        if(!intent.equals(order.path("intent").asText())) throw CommerceException.held("Provider order uses the wrong payment lifecycle");
    }
    private static void verifyOptional(JsonNode node,String field,String expected) {
        if(node.hasNonNull(field) && !Objects.equals(expected,node.path(field).asText()))
            throw CommerceException.held("Provider resource binding does not match");
    }
    private static void verifyPayment(JsonNode payment,PaymentCommand c,String payee,String order,String authorization,String id) {
        verifyId(payment,id); verifyAmount(payment.path("amount"),c);
        verifyOptional(payment.path("payee"),"merchant_id",payee);
        verifyOptional(payment,"custom_id",c.orderId().toString());
        verifyOptional(payment,"invoice_id",c.orderId().toString());
        var related=payment.path("supplementary_data").path("related_ids");
        verifyOptional(related,"order_id",order);
        if(authorization!=null) verifyOptional(related,"authorization_id",authorization);
    }
    private static void verifyAuthorization(JsonNode order, PaymentCommand c) {
        boolean found = false;
        for (var auth : order.path("purchase_units").get(0).path("payments").path("authorizations")) {
            if (Objects.equals(c.providerResourceId(),auth.path("id").asText())) { verifyAmount(auth.path("amount"),c); found = true; }
        }
        if (!found) throw CommerceException.held("Authorization does not belong to the approved provider order");
    }
    public static void verifyAmount(JsonNode amount, PaymentCommand c) {
        if (!c.currency().equals(amount.path("currency_code").asText())
            || Money.fromDecimal(amount.path("value").asText()).minor()!=c.amountMinor())
            throw CommerceException.held("Provider amount does not match the approved amount");
    }
    public static ProviderResult readOrder(JsonNode node, PaymentCommand c) {
        return readOrder(node,c,Instant.now());
    }
    private static ProviderResult readOrder(JsonNode node, PaymentCommand c, Instant now) {
        var payments = node.path("purchase_units").path(0).path("payments");
        for(String kind:List.of("authorizations","captures")) {
            var resources=payments.path(kind);
            if(!resources.isMissingNode() && !resources.isNull() && (!resources.isArray() || resources.size()>1))
                throw CommerceException.held("This contract supports one authorization and one full capture");
        }
        String authId=null, captureId=null, approval=null;
        String status=switch(node.path("status").asText()) {
            case "CREATED","SAVED","APPROVED","PAYER_ACTION_REQUIRED" -> "APPROVAL_REQUIRED";
            case "VOIDED" -> "VOIDED";
            default -> "PENDING";
        };
        for (var auth : payments.path("authorizations")) {
            verifyAmount(auth.path("amount"),c); verifyId(auth,null);
            authId=auth.path("id").asText(null);
            status=authorizationStatus(auth,now);
        }
        for (var cap : payments.path("captures")) {
            verifyAmount(cap.path("amount"),c); verifyId(cap,null);
            captureId=cap.path("id").asText(null);
            status = captureStatus(cap.path("status").asText());
        }
        for (var link : node.path("links")) if ("approve".equals(link.path("rel").asText()) || "payer-action".equals(link.path("rel").asText())) approval=link.path("href").asText(null);
        return new ProviderResult(status,node.path("id").asText(null),authId,captureId,approval,c.amountMinor(),c.currency(),c.merchantId(),"PAYPAL_SANDBOX");
    }
    private static String authorizationStatus(JsonNode auth,Instant now) {
        return switch(auth.path("status").asText()) {
            case "CREATED" -> auth.hasNonNull("expiration_time") && !now.isBefore(Instant.parse(auth.path("expiration_time").asText())) ? "EXPIRED" : "AUTHORIZED";
            case "VOIDED" -> "VOIDED";
            case "DENIED","DECLINED" -> "DECLINED";
            case "EXPIRED" -> "EXPIRED";
            default -> "PENDING";
        };
    }
    private static ProviderResult result(PaymentCommand c,String status,String order,String auth,String capture) {
        return new ProviderResult(status,order,auth,capture,null,c.amountMinor(),c.currency(),c.merchantId(),"PAYPAL_SANDBOX");
    }
    private static ProviderResult captureResult(JsonNode capture,PaymentCommand c,String order,String auth) {
        return result(c,captureStatus(capture.path("status").asText()),order,auth,capture.path("id").asText());
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
    /** PayPal could not be reached before any payment effect; the same command identity may be retried. */
    public static final class ProviderNotDispatchedException extends RuntimeException {
        public ProviderNotDispatchedException() { super("PayPal was unavailable before any payment was taken; retry is safe"); }
    }
    public static final class BuyerActionRequiredException extends RuntimeException {
        public BuyerActionRequiredException() { super("PayPal declined the buyer's funding source; no payment was taken"); }
    }
}
