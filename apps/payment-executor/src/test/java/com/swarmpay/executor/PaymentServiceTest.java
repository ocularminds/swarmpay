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
    @Test void aChangedAuthorizationCannotReleaseCatering() {
        var line=plan.lines().get(1);
        when(payments.latest(line.id())).thenReturn(new ProviderResult("AUTHORIZED","order","real-authorization",null,null,90000,"USD","catering","TEST"));
        assertThrows(CommerceException.class,()->service.execute(command(line,90000,Operation.CAPTURE_AUTHORIZATION,"other-authorization"),"hash","dossier"));
        verifyNoInteractions(provider,receipts);
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
