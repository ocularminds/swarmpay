package com.swarmpay.executor;

import com.swarmpay.domain.*;
import com.swarmpay.domain.Commerce.*;
import com.swarmpay.integrations.*;
import com.swarmpay.persistence.*;
import org.junit.jupiter.api.*;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PaymentServiceTest {
    final Instant now=Instant.parse("2026-10-25T12:00:00Z");
    final Clock clock=Clock.fixed(now,ZoneOffset.UTC);
    final CommerceRepository commerce=mock(CommerceRepository.class);
    final PaymentRepository payments=mock(PaymentRepository.class);
    final PaymentProvider provider=mock(PaymentProvider.class);
    final ReceiptVerifier receipts=mock(ReceiptVerifier.class);
    final Plan plan=new PlanFactory(clock).create("organizer",new Intent("Meetup",30,5,150000,now.plusSeconds(3600),"UTC","Pavilion","Rain","RENT"),
        new DemoCatalog().get("tents-standard"),new DemoCatalog().get("catering-seasonal"),List.of()).approved();
    final Line tent=plan.lines().getFirst();
    final PaymentCommand command=command(tent,50000,Operation.CREATE_ORDER,null);
    final PaymentService service=new PaymentService(commerce,payments,provider,receipts,clock,"test-v1","demo");
    @BeforeEach void admittedSnapshot() {
        when(payments.transaction(any())).thenAnswer(call->((Supplier<?>)call.getArgument(0)).get());
        when(payments.state(any())).thenReturn("NOT_EXECUTED");
        when(payments.begin(any(),anyString(),anyString())).thenReturn(true);
        when(commerce.approvedForExecution(plan.id())).thenReturn(plan);
        when(commerce.recordedCommandMatches(any())).thenReturn(true);
        when(commerce.reservationMatches(any(),eq(plan))).thenReturn(true);
        for(var line:plan.lines())when(commerce.line(plan,line.id())).thenReturn(line);
    }
    @Test void changedAmountAndUnreservedBudgetNeverReachProvider() {
        assertThrows(CommerceException.class,()->service.execute(command(tent,50001,Operation.CREATE_ORDER,null),"hash","dossier"));
        when(commerce.reservationMatches(command,plan)).thenReturn(false);
        assertThrows(CommerceException.class,()->service.execute(command,"hash","dossier"));
        verifyNoInteractions(provider);verify(payments,never()).begin(any(),any(),any());
    }
    @Test void aCommandNotInTheDurableOutboxIsRefused() {
        when(commerce.recordedCommandMatches(command)).thenReturn(false);
        assertThrows(CommerceException.class,()->service.execute(command,"hash","dossier"));verifyNoInteractions(provider);
    }
    @Test void completedReplayReturnsTheOriginalResultWithoutDispatch() {
        var result=new ProviderResult("APPROVAL_REQUIRED","original",null,null,null,50000,"USD","tents","TEST");
        when(payments.state(command.id())).thenReturn("COMPLETED");when(payments.result(command.id())).thenReturn(result);
        assertSame(result,service.execute(command,"new-hash","new-dossier"));verifyNoInteractions(provider);
    }
    @Test void lostProviderResponseDoesNotAuthorizeAnotherDispatch() {
        when(provider.execute(command,plan,tent)).thenThrow(new PayPalPaymentProvider.ProviderUncertainException());
        assertEquals(503,assertThrows(CommerceException.class,()->service.execute(command,"hash","dossier")).status());
        verify(payments).uncertain(command.id());
        when(payments.state(command.id())).thenReturn("INDETERMINATE");
        assertThrows(CommerceException.class,()->service.execute(command,"another-hash","another-dossier"));
        verify(provider,times(1)).execute(any(),any(),any());
    }
    @Test void providerUnavailableBeforeAnyEffectIsRetriedUnderTheSameIdentity() {
        var result=new ProviderResult("APPROVAL_REQUIRED","order",null,null,null,50000,"USD","tents","TEST");
        when(provider.execute(command,plan,tent)).thenThrow(new PayPalPaymentProvider.ProviderNotDispatchedException()).thenReturn(result);
        assertThrows(NotDispatchedException.class,()->service.execute(command,"hash","dossier"));
        verify(payments).notDispatched(command.id());
        verify(payments,never()).uncertain(any());verify(payments,never()).fail(any());

        when(payments.state(command.id())).thenReturn("NOT_DISPATCHED");
        assertSame(result,service.execute(command,"fresh-hash","fresh-dossier"));
        verify(payments).checkSame(command);
        verify(payments).begin(command,"fresh-hash","fresh-dossier");
        verify(payments).complete(command.id(),result);
    }
    @Test void reconciliationReportsANotDispatchedAttemptAsRetryable() {
        when(payments.command(command.id())).thenReturn(command);
        when(payments.evidence(command.id())).thenReturn(new GateResult("NOT_DISPATCHED","INDETERMINATE",null,"dossier","hash",null,"",null));
        var reconciled=service.reconcile(command.id());
        assertEquals("NOT_EXECUTED",reconciled.state());assertEquals("NOT_FORWARDED",reconciled.execution());
        verifyNoInteractions(provider);
    }
    @Test void aDeclinedFundingSourceIsDispatchedAgainOnlyAsTheSameCommandAfterTheBuyerApprovesAgain() {
        var c=command(tent,50000,Operation.CAPTURE_ORDER,"order");
        var captured=new ProviderResult("CAPTURED","order",null,"capture",null,50000,"USD","tents","TEST");
        when(payments.latest(tent.id())).thenReturn(new ProviderResult("APPROVAL_REQUIRED","order",null,null,null,50000,"USD","tents","TEST"));
        when(provider.execute(c,plan,tent)).thenThrow(new PayPalPaymentProvider.BuyerActionRequiredException());
        assertThrows(BuyerActionException.class,()->service.execute(c,"hash","dossier"));
        verify(payments).buyerActionRequired(c.id());
        verify(payments,never()).fail(any());verify(payments,never()).uncertain(any());

        when(payments.state(c.id())).thenReturn("BUYER_ACTION_REQUIRED");
        when(payments.buyerAttempts(c.id())).thenReturn(1);
        when(provider.execute(c,plan,tent,1)).thenReturn(captured);
        assertSame(captured,service.execute(c,"fresh-hash","fresh-dossier"));
        verify(payments).checkSame(c);
        verify(payments).begin(c,"fresh-hash","fresh-dossier");
        verify(payments).complete(c.id(),captured);

        // A changed command cannot borrow the declined attempt's identity, and the buyer's retries are bounded.
        doThrow(CommerceException.conflict("changed")).when(payments).checkSame(c);
        assertThrows(CommerceException.class,()->service.execute(c,"hash","dossier"));
        doNothing().when(payments).checkSame(c);
        when(payments.buyerAttempts(c.id())).thenReturn(5);
        assertThrows(CommerceException.class,()->service.execute(c,"hash","dossier"));
        verify(provider,times(1)).execute(c,plan,tent,1);
    }
    @Test void reconciliationReportsADeclinedFundingSourceAsAwaitingTheBuyer() {
        when(payments.command(command.id())).thenReturn(command);
        when(payments.evidence(command.id())).thenReturn(new GateResult("BUYER_ACTION_REQUIRED","INDETERMINATE",null,"dossier","hash",null,"",null));
        var reconciled=service.reconcile(command.id());
        assertEquals("BUYER_ACTION_REQUIRED",reconciled.state());assertEquals("NOT_FORWARDED",reconciled.execution());
        verifyNoInteractions(provider);
    }
    @Test void aChangedAuthorizationCannotReleaseCatering() {
        var line=plan.lines().get(1);
        when(payments.latest(line.id())).thenReturn(new ProviderResult("AUTHORIZED","order","real-authorization",null,null,90000,"USD","catering","TEST"));
        assertThrows(CommerceException.class,()->service.execute(command(line,90000,Operation.CAPTURE_AUTHORIZATION,"other-authorization"),"hash","dossier"));
        verifyNoInteractions(provider,receipts);
    }
    @Test void aRenewalTargetsTheRecordedHoldAndMustComeBackAsANewAuthorization() {
        var line=plan.lines().get(1);
        when(payments.latest(line.id())).thenReturn(new ProviderResult("AUTHORIZED","order","first-authorization",null,null,90000,"USD","catering","TEST"));
        assertThrows(CommerceException.class,()->service.execute(command(line,90000,Operation.REAUTHORIZE_AUTHORIZATION,"other-authorization"),"hash","dossier"));
        verifyNoInteractions(provider);
        // PayPal answering with the same authorization has not renewed anything.
        var same=command(line,90000,Operation.REAUTHORIZE_AUTHORIZATION,"first-authorization");
        when(provider.execute(same,plan,line)).thenReturn(new ProviderResult("AUTHORIZED","order","first-authorization",null,null,90000,"USD","catering","TEST"));
        assertEquals(503,assertThrows(CommerceException.class,()->service.execute(same,"hash","dossier")).status());
        verify(payments).uncertain(same.id());
        var renew=command(line,90000,Operation.REAUTHORIZE_AUTHORIZATION,"first-authorization");
        var renewed=new ProviderResult("AUTHORIZED","order","renewed-authorization",null,null,90000,"USD","catering","TEST");
        when(provider.execute(renew,plan,line)).thenReturn(renewed);
        assertSame(renewed,service.execute(renew,"hash","dossier"));
        verify(payments).complete(renew.id(),renewed);
    }
    @Test void onlyACancelledEventsCapturedTentsAreRefundedAndOnlyBeforeItStarts() {
        when(commerce.approvedForVoid(plan.id())).thenReturn(plan);
        when(payments.latest(tent.id())).thenReturn(new ProviderResult("CAPTURED","order",null,"capture",null,50000,"USD","tents","TEST"));
        var refund=command(tent,50000,Operation.REFUND_CAPTURE,"capture");
        assertThrows(CommerceException.class,()->service.execute(refund,"hash","dossier"));
        when(commerce.frozen(plan.id())).thenReturn(true);
        assertThrows(CommerceException.class,()->service.execute(command(tent,50000,Operation.REFUND_CAPTURE,"other-capture"),"hash","dossier"));
        var started=new PaymentService(commerce,payments,provider,receipts,Clock.fixed(plan.intent().eventAt(),ZoneOffset.UTC),"test-v1","demo");
        assertThrows(CommerceException.class,()->started.execute(refund,"hash","dossier"));
        verifyNoInteractions(provider);
        var refunded=new ProviderResult("REFUNDED","order",null,"capture",null,50000,"USD","tents","TEST","refund");
        when(provider.execute(refund,plan,tent)).thenReturn(refunded);
        assertSame(refunded,service.execute(refund,"hash","dossier"));
        verify(payments).complete(refund.id(),refunded);
    }
    @Test void cateringCanBeAuthorizedUpTo27DaysBeforeDelivery() {
        for(var days:List.of(10L,27L,28L)) {
            var far=new PlanFactory(clock).create("organizer",new Intent("Meetup",30,5,150000,now.plus(Duration.ofDays(days)).minusSeconds(60),"UTC","Pavilion","Rain","RENT"),
                new DemoCatalog().get("tents-standard"),new DemoCatalog().get("catering-seasonal"),List.of()).approved();
            var line=far.lines().get(1);
            when(commerce.approvedForExecution(far.id())).thenReturn(far);when(commerce.reservationMatches(any(),eq(far))).thenReturn(true);when(commerce.line(far,line.id())).thenReturn(line);
            var checkout=new PaymentCommand(UUID.randomUUID(),far.id(),1,line.id(),Operation.CREATE_ORDER,line.merchantId(),90000,"USD",null,null,far.id().toString(),"test-v1");
            when(provider.execute(checkout,far,line)).thenReturn(new ProviderResult("APPROVAL_REQUIRED","order",null,null,null,90000,"USD","catering","TEST"));
            if(days<28) assertEquals("APPROVAL_REQUIRED",service.execute(checkout,"hash","dossier").status());
            else assertEquals("HELD",assertThrows(CommerceException.class,()->service.execute(checkout,"hash","dossier")).code());
        }
    }
    @Test void quoteExpiryIsRecheckedAtExecution() {
        var later=new PaymentService(commerce,payments,provider,receipts,Clock.fixed(now.plusSeconds(1801),ZoneOffset.UTC),"test-v1","demo");
        assertThrows(CommerceException.class,()->later.execute(command,"hash","dossier"));verifyNoInteractions(provider);
    }
    @Test void reconciliationRetainsPendingResourceIdentityAndNeverDispatches() {
        var c=command(tent,50000,Operation.CAPTURE_ORDER,"order");
        var pending=new ProviderResult("PENDING","order",null,"capture",null,50000,"USD","tents","TEST");
        var captured=new ProviderResult("CAPTURED","order",null,"capture",null,50000,"USD","tents","TEST");
        when(payments.command(c.id())).thenReturn(c);
        when(payments.result(c.id())).thenReturn(pending);
        when(payments.evidence(c.id())).thenReturn(new GateResult("COMPLETED","FORWARDED",null,"dossier","hash",null,"",pending));
        when(provider.reconcile(c,pending)).thenReturn(captured);
        assertSame(captured,service.reconcile(c.id()).result());
        verify(payments).complete(c.id(),captured);
        verify(provider,never()).execute(any(),any(),any());
    }
    @Test void contradictoryReconciliationCannotReplaceTheRecordedCapture() {
        var c=command(tent,50000,Operation.CAPTURE_ORDER,"order");
        var pending=new ProviderResult("PENDING","order",null,"original-capture",null,50000,"USD","tents","TEST");
        when(payments.command(c.id())).thenReturn(c);
        when(payments.result(c.id())).thenReturn(pending);
        when(payments.evidence(c.id())).thenReturn(new GateResult("COMPLETED","FORWARDED",null,"dossier","hash",null,"",pending));
        for(var changed:List.of(
            new ProviderResult("CAPTURED","order",null,"other-capture",null,50000,"USD","tents","TEST"),
            new ProviderResult("CAPTURED","other-order",null,"original-capture",null,50000,"USD","tents","TEST"),
            new ProviderResult("CAPTURED","order",null,"original-capture",null,50001,"USD","tents","TEST"),
            new ProviderResult("CAPTURED","order",null,"original-capture",null,50000,"USD","other-merchant","TEST"))) {
            when(provider.reconcile(c,pending)).thenReturn(changed);
            assertSame(pending,service.reconcile(c.id()).result());
        }
        verify(payments,never()).complete(any(),any());
        verify(provider,never()).execute(any(),any(),any());
    }
    PaymentCommand command(Line line,long amount,Operation operation,String resource){return new PaymentCommand(UUID.randomUUID(),plan.id(),1,line.id(),operation,line.merchantId(),amount,"USD",resource,null,plan.id().toString(),"test-v1");}
}
