package com.swarmpay.integrations;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.swarmpay.domain.*;
import com.swarmpay.domain.Commerce.*;
import com.swarmpay.integrations.PayPalHttpFixture.Response;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.time.*;
import java.util.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.jupiter.api.Assertions.*;

class PayPalProtocolTest {
    static final String ORDER="5O190127TN364715T", AUTH="0VF52814937998046", CAPTURE="2GG279541U471931P", PAYEE="MERCHANT1";
    final Plan plan=new PlanFactory(Clock.fixed(Instant.parse("2026-10-25T12:00:00Z"),ZoneOffset.UTC)).create("organizer",
        new Intent("Meetup",30,5,150000,Instant.parse("2026-10-26T12:00:00Z"),"UTC","Pavilion","Rain","RENT"),
        new DemoCatalog().get("tents-standard"),new DemoCatalog().get("catering-seasonal"),List.of());
    final Line tents=plan.lines().getFirst(), catering=plan.lines().get(1);
    PayPalHttpFixture http;
    PayPalPaymentProvider provider;

    @BeforeEach void start() throws Exception {
        http=new PayPalHttpFixture();
        provider=provider(Duration.ofSeconds(3));
    }
    @AfterEach void stop() { http.close(); }
    PayPalPaymentProvider provider(Duration timeout) {
        var account=new PayPalPaymentProvider.MerchantAccount("fixture-client","fixture-secret",PAYEE,"fixture-webhook");
        return new PayPalPaymentProvider(Map.of("tents",account,"catering",account),id->ORDER,http.transport(timeout),Clock.fixed(plan.createdAt(),ZoneOffset.UTC));
    }
    PaymentCommand command(Line line,Operation operation) {
        String resource=switch(operation) {
            case CREATE_ORDER -> null;
            case CAPTURE_ORDER,AUTHORIZE_ORDER -> ORDER;
            case REFUND_CAPTURE -> CAPTURE;
            default -> AUTH;
        };
        return new PaymentCommand(UUID.randomUUID(),plan.id(),1,line.id(),operation,line.merchantId(),line.totalMinor(),"USD",resource,null,plan.id().toString(),"test-v1");
    }
    ObjectNode order(Line line,String status,Map<String,Object> payments) {
        return Json.MAPPER.valueToTree(Map.of("id",ORDER,"intent",line.paymentIntent(),"status",status,
            "purchase_units",List.of(Map.of("reference_id",line.id().toString(),"custom_id",line.id().toString(),
                "payee",Map.of("merchant_id",PAYEE),"amount",amount(line),"payments",payments))));
    }
    Map<String,String> amount(Line line) { return Map.of("currency_code","USD","value",Money.usd(line.totalMinor()).decimal()); }
    ObjectNode payment(Line line,String id,String status) {
        var related=new LinkedHashMap<String,String>(); related.put("order_id",ORDER);
        if(line==catering) related.put("authorization_id",AUTH);
        return Json.MAPPER.valueToTree(Map.of("id",id,"status",status,"amount",amount(line),
            "payee",Map.of("merchant_id",PAYEE),"custom_id",line.id().toString(),"supplementary_data",Map.of("related_ids",related)));
    }
    Map<String,Object> authorized() { return Map.of("authorizations",List.of(payment(catering,AUTH,"CREATED"))); }
    Map<String,Object> captured(Line line) {
        var payments=new LinkedHashMap<String,Object>();
        if(line==catering) payments.putAll(authorized());
        payments.put("captures",List.of(payment(line,CAPTURE,"COMPLETED")));
        return payments;
    }
    Response error(int status,String issue) {
        return new Response(status,Map.of("name","UNPROCESSABLE_ENTITY","message","Fixture error","details",List.of(Map.of("issue",issue))));
    }
    void route(PayPalHttpFixture.Handler handler) {
        http.handler=request->request.path().equals("/v1/oauth2/token") ? PayPalHttpFixture.oauth() : handler.respond(request);
    }

    @Test void sendsSellerCredentialsAndOneBoundPurchaseUnitWithStableIdempotency() throws Exception {
        var c=command(tents,Operation.CREATE_ORDER);
        route(r->new Response(201,order(tents,"CREATED",Map.of())));
        assertEquals("APPROVAL_REQUIRED",provider.execute(c,plan,tents).status());
        var oauth=http.requests.getFirst();
        assertEquals("POST",oauth.method());
        assertEquals("Basic "+Base64.getEncoder().encodeToString("fixture-client:fixture-secret".getBytes(java.nio.charset.StandardCharsets.UTF_8)),oauth.header("Authorization"));
        assertTrue(oauth.body().contains("grant_type=client_credentials"));
        var request=http.paymentPosts().getFirst();
        assertEquals("/v2/checkout/orders",request.path());
        assertEquals(c.requestId(),request.header("PayPal-Request-Id"));
        assertEquals("return=representation",request.header("Prefer"));
        assertEquals("Bearer fixture-token",request.header("Authorization"));
        var body=Json.MAPPER.readTree(request.body());
        assertEquals("CAPTURE",body.path("intent").asText());
        assertEquals(1,body.path("purchase_units").size());
        var unit=body.path("purchase_units").get(0);
        assertEquals(PAYEE,unit.path("payee").path("merchant_id").asText());
        assertEquals(tents.id().toString(),unit.path("custom_id").asText());
        assertEquals("500.00",unit.path("amount").path("value").asText());
    }

    @Test void authorizesThenCapturesTheExactCateringAmountAndAuthorization() throws Exception {
        var isAuthorized=new AtomicBoolean();
        route(r->{
            if(r.method().equals("GET")) return new Response(200,order(catering,isAuthorized.get()?"COMPLETED":"APPROVED",isAuthorized.get()?authorized():Map.of()));
            if(r.path().endsWith("/authorize")) { isAuthorized.set(true); return new Response(201,order(catering,"COMPLETED",authorized())); }
            return new Response(201,payment(catering,CAPTURE,"COMPLETED"));
        });
        var authorize=command(catering,Operation.AUTHORIZE_ORDER);
        var authorization=provider.execute(authorize,plan,catering);
        assertEquals("AUTHORIZED",authorization.status()); assertEquals(AUTH,authorization.authorizationId());
        var capture=command(catering,Operation.CAPTURE_AUTHORIZATION);
        var result=provider.execute(capture,plan,catering);
        assertEquals("CAPTURED",result.status()); assertEquals(AUTH,result.authorizationId()); assertEquals(CAPTURE,result.captureId());
        var posts=http.paymentPosts();
        assertEquals(2,posts.size());
        assertEquals(authorize.requestId(),posts.get(0).header("PayPal-Request-Id"));
        assertEquals(capture.requestId(),posts.get(1).header("PayPal-Request-Id"));
        assertEquals("/v2/payments/authorizations/"+AUTH+"/capture",posts.get(1).path());
        var body=Json.MAPPER.readTree(posts.get(1).body());
        assertEquals("900.00",body.path("amount").path("value").asText());
        assertTrue(body.path("final_capture").asBoolean());
    }

    @ParameterizedTest @ValueSource(strings={"payee","amount","contract","order","intent","capture-id","duplicate-capture"})
    void contradictoryCaptureResponsesRemainUncertain(String changed) {
        var invalid=order(tents,"COMPLETED",captured(tents));
        var unit=(ObjectNode)invalid.path("purchase_units").get(0);
        switch(changed) {
            case "payee" -> ((ObjectNode)unit.path("payee")).put("merchant_id","OTHERSELLER");
            case "amount" -> ((ObjectNode)unit.path("amount")).put("value","500.01");
            case "contract" -> unit.put("custom_id",UUID.randomUUID().toString());
            case "order" -> invalid.put("id","OTHERORDER");
            case "intent" -> invalid.put("intent","AUTHORIZE");
            case "capture-id" -> ((ObjectNode)unit.path("payments").path("captures").get(0)).remove("id");
            case "duplicate-capture" -> unit.set("payments",Json.MAPPER.valueToTree(Map.of("captures",List.of(payment(tents,CAPTURE,"COMPLETED"),payment(tents,"OTHERCAPTURE","COMPLETED")))));
        }
        route(r->new Response(200,r.method().equals("GET")?order(tents,"APPROVED",Map.of()):invalid));
        assertThrows(PayPalPaymentProvider.ProviderUncertainException.class,()->provider.execute(command(tents,Operation.CAPTURE_ORDER),plan,tents));
        assertEquals(1,http.paymentPosts().size());
    }

    @Test void partialCaptureRepresentationIsConfirmedByAFullOrderRead() {
        var committed=new AtomicBoolean();
        route(r->{
            if(r.method().equals("GET")) return new Response(200,order(tents,committed.get()?"COMPLETED":"APPROVED",committed.get()?captured(tents):Map.of()));
            committed.set(true);
            return new Response(201,Map.of("id",ORDER,"status","COMPLETED","purchase_units",List.of(Map.of("reference_id",tents.id().toString(),"payments",captured(tents)))));
        });
        assertEquals("CAPTURED",provider.execute(command(tents,Operation.CAPTURE_ORDER),plan,tents).status());
        assertEquals(2,http.requests.stream().filter(r->r.path().equals("/v2/checkout/orders/"+ORDER)).count());
        assertEquals(1,http.paymentPosts().size());
    }

    @ParameterizedTest @ValueSource(strings={"order","intent","payee","multiple-payments"})
    void mismatchedOrderReadPreventsTheMoneyPost(String changed) {
        var invalid=order(tents,"APPROVED",Map.of());
        if(changed.equals("order")) invalid.put("id","OTHERORDER");
        if(changed.equals("intent")) invalid.put("intent","AUTHORIZE");
        if(changed.equals("payee")) ((ObjectNode)invalid.path("purchase_units").get(0).path("payee")).put("merchant_id","OTHERSELLER");
        if(changed.equals("multiple-payments")) ((ObjectNode)invalid.path("purchase_units").get(0)).set("payments",
            Json.MAPPER.valueToTree(Map.of("captures",List.of(payment(tents,CAPTURE,"COMPLETED"),payment(tents,"OTHERCAPTURE","COMPLETED")))));
        route(r->new Response(200,invalid));
        assertThrows(CommerceException.class,()->provider.execute(command(tents,Operation.CAPTURE_ORDER),plan,tents));
        assertTrue(http.paymentPosts().isEmpty());
    }

    @ParameterizedTest @ValueSource(ints={408,409,429,500,503})
    void timeoutConflictThrottlingAndServerFailureNeverAutomaticallyRedispatch(int status) {
        route(r->r.method().equals("GET")?new Response(200,order(tents,"APPROVED",Map.of())):error(status,"RESOURCE_CONFLICT"));
        assertThrows(PayPalPaymentProvider.ProviderUncertainException.class,()->provider.execute(command(tents,Operation.CAPTURE_ORDER),plan,tents));
        assertEquals(1,http.paymentPosts().size());
    }

    @ParameterizedTest @ValueSource(ints={500,503})
    void aFailedOrderReadBeforeTheCaptureSendsNoPaymentAndIsRetrySafe(int status) {
        route(r->error(status,"INTERNAL_SERVICE_ERROR"));
        assertThrows(PayPalPaymentProvider.ProviderNotDispatchedException.class,()->provider.execute(command(tents,Operation.CAPTURE_ORDER),plan,tents));
        assertEquals(0,http.paymentPosts().size());
    }

    @Test void anUnavailableOAuthServerSendsNoPaymentAndIsRetrySafe() {
        http.handler=r->r.path().equals("/v1/oauth2/token") ? error(503,"SERVICE_UNAVAILABLE") : new Response(200,order(catering,"COMPLETED",authorized()));
        assertThrows(PayPalPaymentProvider.ProviderNotDispatchedException.class,()->provider.execute(command(catering,Operation.CAPTURE_AUTHORIZATION),plan,catering));
        assertThrows(PayPalPaymentProvider.ProviderNotDispatchedException.class,()->provider.execute(command(tents,Operation.CREATE_ORDER),plan,tents));
        assertEquals(0,http.paymentPosts().size());
    }

    @Test void aLostCreateOrderResponseIsReplayedUnderTheSameRequestId() {
        var attempts=new java.util.concurrent.atomic.AtomicInteger();
        route(r->attempts.incrementAndGet()==1 ? error(503,"INTERNAL_SERVICE_ERROR") : new Response(201,order(tents,"CREATED",Map.of())));
        var c=command(tents,Operation.CREATE_ORDER);
        assertThrows(PayPalPaymentProvider.ProviderNotDispatchedException.class,()->provider.execute(c,plan,tents));
        assertEquals("APPROVAL_REQUIRED",provider.execute(c,plan,tents).status());
        assertEquals(2,http.paymentPosts().size());
        assertTrue(http.paymentPosts().stream().allMatch(r->c.requestId().equals(r.header("PayPal-Request-Id"))));
    }

    @Test void alreadyCapturedErrorNeedsReconciliationRatherThanARefusal() {
        route(r->r.method().equals("GET")?new Response(200,order(tents,"APPROVED",Map.of())):error(422,"ORDER_ALREADY_CAPTURED"));
        assertThrows(PayPalPaymentProvider.ProviderUncertainException.class,()->provider.execute(command(tents,Operation.CAPTURE_ORDER),plan,tents));
        assertEquals(1,http.paymentPosts().size());
    }

    @Test void aDeclinedFundingSourceLetsTheBuyerApproveTheSameOrderAgain() {
        var declined=new AtomicBoolean();
        route(r->r.method().equals("GET")?new Response(200,order(tents,"APPROVED",Map.of()))
            :declined.getAndSet(true)?new Response(201,order(tents,"COMPLETED",captured(tents))):error(422,"INSTRUMENT_DECLINED"));
        var c=command(tents,Operation.CAPTURE_ORDER);
        assertThrows(PayPalPaymentProvider.BuyerActionRequiredException.class,()->provider.execute(c,plan,tents));
        assertEquals("CAPTURED",provider.execute(c,plan,tents,1).status());
        // The second approval is a new provider request; PayPal still captures an order only once.
        assertEquals(List.of(c.requestId(),c.requestId()+"-buyer-1"),http.paymentPosts().stream().map(r->r.header("PayPal-Request-Id")).toList());
    }

    @Test void refusalsTheBuyerCannotFixAreReportedAsRefused() {
        route(r->r.method().equals("GET")?new Response(200,order(tents,"APPROVED",Map.of())):error(422,"PAYER_CANNOT_PAY"));
        assertEquals("PAYPAL_REFUSED",assertThrows(CommerceException.class,()->provider.execute(command(tents,Operation.CAPTURE_ORDER),plan,tents)).code());
        // Capturing an authorization involves no buyer, so a decline there cannot be approved again.
        route(r->r.method().equals("GET")?new Response(200,order(catering,"COMPLETED",authorized())):error(422,"INSTRUMENT_DECLINED"));
        assertEquals("PAYPAL_REFUSED",assertThrows(CommerceException.class,()->provider.execute(command(catering,Operation.CAPTURE_AUTHORIZATION),plan,catering)).code());
        assertThrows(IllegalArgumentException.class,()->provider.execute(command(catering,Operation.CAPTURE_AUTHORIZATION),plan,catering,1));
        assertEquals(2,http.paymentPosts().size());
    }

    @Test void lostCaptureResponseIsRecoveredWithReadsOnly() {
        var committed=new AtomicBoolean();
        route(r->{
            if(r.path().equals("/v2/payments/captures/"+CAPTURE)) return new Response(200,payment(tents,CAPTURE,"COMPLETED"));
            if(r.method().equals("GET")) return new Response(200,order(tents,committed.get()?"COMPLETED":"APPROVED",committed.get()?captured(tents):Map.of()));
            committed.set(true); return null;
        });
        var c=command(tents,Operation.CAPTURE_ORDER);
        assertThrows(PayPalPaymentProvider.ProviderUncertainException.class,()->provider.execute(c,plan,tents));
        assertEquals("CAPTURED",provider.reconcile(c,null).status());
        assertEquals(1,http.paymentPosts().size());
    }

    @Test void preservesKnownPendingCaptureWhenTheOrderResponseLags() {
        route(r->new Response(200,r.path().startsWith("/v2/checkout/orders/")?order(catering,"COMPLETED",authorized()):payment(catering,CAPTURE,"COMPLETED")));
        var c=command(catering,Operation.CAPTURE_AUTHORIZATION);
        var known=new ProviderResult("PENDING",ORDER,AUTH,CAPTURE,null,90000,"USD","catering","PAYPAL_SANDBOX");
        var result=provider.reconcile(c,known);
        assertNotNull(result); assertEquals("CAPTURED",result.status()); assertEquals(CAPTURE,result.captureId()); assertEquals(AUTH,result.authorizationId());
        assertTrue(http.requests.stream().anyMatch(r->r.path().equals("/v2/payments/captures/"+CAPTURE)));
        assertTrue(http.paymentPosts().isEmpty());
    }

    @Test void expiredAuthorizationComesFromTheBoundPaymentsResource() {
        var expired=payment(catering,AUTH,"CREATED").put("expiration_time","2026-10-25T11:59:59Z");
        route(r->new Response(200,r.path().startsWith("/v2/checkout/orders/")?order(catering,"COMPLETED",authorized()):expired));
        var result=provider.reconcile(command(catering,Operation.CAPTURE_AUTHORIZATION),null);
        assertNotNull(result); assertEquals("EXPIRED",result.status()); assertTrue(http.paymentPosts().isEmpty());
    }

    @ParameterizedTest @ValueSource(strings={"authorization","order","capture","payee","amount"})
    void mismatchedResourceCannotCompleteReconciliation(String changed) {
        var capture=payment(catering,CAPTURE,"COMPLETED");
        var related=(ObjectNode)capture.path("supplementary_data").path("related_ids");
        switch(changed) {
            case "authorization" -> related.put("authorization_id","OTHERAUTH");
            case "order" -> related.put("order_id","OTHERORDER");
            case "capture" -> capture.put("id","OTHERCAPTURE");
            case "payee" -> ((ObjectNode)capture.path("payee")).put("merchant_id","OTHERSELLER");
            case "amount" -> ((ObjectNode)capture.path("amount")).put("value","899.99");
        }
        route(r->new Response(200,r.path().startsWith("/v2/checkout/orders/")?order(catering,"COMPLETED",authorized()):capture));
        var known=new ProviderResult("PENDING",ORDER,AUTH,CAPTURE,null,90000,"USD","catering","PAYPAL_SANDBOX");
        assertNull(provider.reconcile(command(catering,Operation.CAPTURE_AUTHORIZATION),known));
        assertTrue(http.paymentPosts().isEmpty());
    }

    @Test void voidAcknowledgementRequiresAConfirmedMatchingAuthorization() {
        route(r->{
            if(r.path().startsWith("/v2/checkout/orders/")) return new Response(200,order(catering,"COMPLETED",authorized()));
            return r.method().equals("POST")?new Response(204,Map.of()):new Response(200,payment(catering,AUTH,"VOIDED"));
        });
        var c=command(catering,Operation.VOID_AUTHORIZATION);
        assertEquals("VOIDED",provider.execute(c,plan,catering).status());
        assertEquals(c.requestId(),http.paymentPosts().getFirst().header("PayPal-Request-Id"));
    }

    static final String RENEWED="4XN27011UY8543104", REFUND="1JU08902781691411";
    ObjectNode authorization(String id,String created,String related) {
        var auth=payment(catering,id,"CREATED").put("create_time",created);
        ((ObjectNode)auth.path("supplementary_data").path("related_ids")).put("authorization_id",related);
        return auth;
    }
    Map<String,Object> renewed() {
        return Map.of("authorizations",List.of(authorization(AUTH,"2026-10-20T12:00:00Z",AUTH),authorization(RENEWED,"2026-10-24T12:00:00Z",RENEWED)));
    }
    ObjectNode refund(String status,String capture) {
        return Json.MAPPER.valueToTree(Map.of("id",REFUND,"status",status,"amount",amount(tents),"custom_id",tents.id().toString(),
            "links",List.of(Map.of("rel","up","href","https://api.sandbox.paypal.com/v2/payments/captures/"+capture))));
    }

    @Test void aRenewalReauthorizesTheExactHoldAsANewAuthorization() throws Exception {
        route(r->{
            if(r.path().startsWith("/v2/checkout/orders/")) return new Response(200,order(catering,"COMPLETED",authorized()));
            return new Response(201,authorization(RENEWED,"2026-10-24T12:00:00Z",RENEWED));
        });
        var c=command(catering,Operation.REAUTHORIZE_AUTHORIZATION);
        var result=provider.execute(c,plan,catering);
        assertEquals("AUTHORIZED",result.status()); assertEquals(RENEWED,result.authorizationId());
        var post=http.paymentPosts().getFirst();
        assertEquals("/v2/payments/authorizations/"+AUTH+"/reauthorize",post.path());
        assertEquals(c.requestId(),post.header("PayPal-Request-Id"));
        assertEquals("900.00",Json.MAPPER.readTree(post.body()).path("amount").path("value").asText());
    }
    @Test void aRenewalInsideTheHonorPeriodIsRefusedWithNothingChanged() {
        route(r->r.path().startsWith("/v2/checkout/orders/")?new Response(200,order(catering,"COMPLETED",authorized())):error(422,"REAUTHORIZATION_TOO_SOON"));
        assertEquals("PAYPAL_REFUSED",assertThrows(CommerceException.class,()->provider.execute(command(catering,Operation.REAUTHORIZE_AUTHORIZATION),plan,catering)).code());
    }
    @Test void aLostRenewalIsRecoveredFromTheOrdersSecondAuthorizationWithReadsOnly() {
        var committed=new AtomicBoolean();
        route(r->{
            if(r.path().equals("/v2/payments/authorizations/"+RENEWED)) return new Response(200,authorization(RENEWED,"2026-10-24T12:00:00Z",RENEWED));
            if(r.method().equals("GET")) return new Response(200,order(catering,"COMPLETED",committed.get()?renewed():authorized()));
            committed.set(true); return null;
        });
        var c=command(catering,Operation.REAUTHORIZE_AUTHORIZATION);
        assertThrows(PayPalPaymentProvider.ProviderUncertainException.class,()->provider.execute(c,plan,catering));
        var recovered=provider.reconcile(c,null);
        assertEquals("AUTHORIZED",recovered.status()); assertEquals(RENEWED,recovered.authorizationId());
        assertEquals(1,http.paymentPosts().size());
    }
    @Test void afterARenewalTheDeliveryCapturesTheNewerAuthorization() {
        var capture=payment(catering,CAPTURE,"COMPLETED");
        ((ObjectNode)capture.path("supplementary_data").path("related_ids")).put("authorization_id",RENEWED);
        route(r->r.path().startsWith("/v2/checkout/orders/")?new Response(200,order(catering,"COMPLETED",renewed())):new Response(201,capture));
        var c=new PaymentCommand(UUID.randomUUID(),plan.id(),1,catering.id(),Operation.CAPTURE_AUTHORIZATION,"catering",catering.totalMinor(),"USD",RENEWED,null,plan.id().toString(),"test-v1");
        var result=provider.execute(c,plan,catering);
        assertEquals("CAPTURED",result.status()); assertEquals(RENEWED,result.authorizationId());
        assertEquals("/v2/payments/authorizations/"+RENEWED+"/capture",http.paymentPosts().getFirst().path());
    }
    @Test void aCancellationRefundsTheFullCaptureAndRecordsTheRefund() throws Exception {
        route(r->r.path().startsWith("/v2/checkout/orders/")?new Response(200,order(tents,"COMPLETED",captured(tents))):new Response(201,refund("COMPLETED",CAPTURE)));
        var c=command(tents,Operation.REFUND_CAPTURE);
        var result=provider.execute(c,plan,tents);
        assertEquals("REFUNDED",result.status()); assertEquals(CAPTURE,result.captureId()); assertEquals(REFUND,result.refundId());
        var post=http.paymentPosts().getFirst();
        assertEquals("/v2/payments/captures/"+CAPTURE+"/refund",post.path());
        assertEquals(c.requestId(),post.header("PayPal-Request-Id"));
        var body=Json.MAPPER.readTree(post.body());
        assertEquals("500.00",body.path("amount").path("value").asText()); assertEquals(tents.id().toString(),body.path("custom_id").asText());
    }
    @Test void aRefundOfAnotherCaptureIsNotAccepted() {
        route(r->r.path().startsWith("/v2/checkout/orders/")?new Response(200,order(tents,"COMPLETED",captured(tents))):new Response(201,refund("COMPLETED","OTHERCAPTURE")));
        assertThrows(PayPalPaymentProvider.ProviderUncertainException.class,()->provider.execute(command(tents,Operation.REFUND_CAPTURE),plan,tents));
    }
    @Test void aLostRefundIsRecoveredFromTheOrdersRefundWithReadsOnly() {
        var committed=new AtomicBoolean();
        route(r->{
            if(r.path().equals("/v2/payments/refunds/"+REFUND)) return new Response(200,refund("COMPLETED",CAPTURE));
            if(r.method().equals("GET")) {
                if(!committed.get()) return new Response(200,order(tents,"COMPLETED",captured(tents)));
                var payments=new LinkedHashMap<String,Object>(); payments.put("captures",List.of(payment(tents,CAPTURE,"REFUNDED"))); payments.put("refunds",List.of(refund("COMPLETED",CAPTURE)));
                return new Response(200,order(tents,"COMPLETED",payments));
            }
            committed.set(true); return null;
        });
        var c=command(tents,Operation.REFUND_CAPTURE);
        assertThrows(PayPalPaymentProvider.ProviderUncertainException.class,()->provider.execute(c,plan,tents));
        var recovered=provider.reconcile(c,null);
        assertEquals("REFUNDED",recovered.status()); assertEquals(REFUND,recovered.refundId());
        assertEquals(1,http.paymentPosts().size());
    }
    @Test void failedReadAfterAcceptedVoidDoesNotClaimDefiniteRefusal() {
        route(r->{
            if(r.path().startsWith("/v2/checkout/orders/")) return new Response(200,order(catering,"COMPLETED",authorized()));
            return r.method().equals("POST")?new Response(204,Map.of()):error(404,"RESOURCE_NOT_FOUND");
        });
        assertThrows(PayPalPaymentProvider.ProviderUncertainException.class,()->provider.execute(command(catering,Operation.VOID_AUTHORIZATION),plan,catering));
        assertEquals(1,http.paymentPosts().size());
    }

    @Test void redirectNeverForwardsThePaymentOrCredentialsToItsLocation() {
        route(r->r.method().equals("GET")?new Response(200,order(tents,"APPROVED",Map.of())):new Response(307,Map.of(),Map.of("Location",http.base()+"/unexpected")));
        assertThrows(PayPalPaymentProvider.ProviderUncertainException.class,()->provider.execute(command(tents,Operation.CAPTURE_ORDER),plan,tents));
        assertFalse(http.requests.stream().anyMatch(r->r.path().equals("/unexpected")));
        assertEquals(1,http.paymentPosts().size());
    }

    @Test void realSocketTimeoutDoesNotRetryTheCapture() {
        provider=provider(Duration.ofMillis(250));
        var release=new CountDownLatch(1);
        route(r->{
            if(r.method().equals("GET")) return new Response(200,order(tents,"APPROVED",Map.of()));
            release.await(2,TimeUnit.SECONDS); return new Response(201,order(tents,"COMPLETED",captured(tents)));
        });
        try {
            assertTimeoutPreemptively(Duration.ofSeconds(2),()->assertThrows(PayPalPaymentProvider.ProviderUncertainException.class,()->provider.execute(command(tents,Operation.CAPTURE_ORDER),plan,tents)));
            assertEquals(1,http.paymentPosts().size());
        } finally { release.countDown(); }
    }
}
