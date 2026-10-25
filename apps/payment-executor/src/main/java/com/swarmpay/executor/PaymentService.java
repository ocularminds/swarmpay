package com.swarmpay.executor;

import com.swarmpay.domain.Commerce.*;
import com.swarmpay.domain.CommerceException;
import com.swarmpay.integrations.*;
import com.swarmpay.persistence.*;
import java.time.*;
import java.util.*;

public final class PaymentService {
    private final CommerceRepository commerce;
    private final PaymentRepository payments;
    private final PaymentProvider provider;
    private final ReceiptVerifier verifier;
    private final Clock clock;
    private final String policyVersion;
    private final String mode;
    public PaymentService(CommerceRepository commerce,PaymentRepository payments,PaymentProvider provider,ReceiptVerifier verifier,Clock clock,String policyVersion,String mode) {
        this.commerce=commerce; this.payments=payments; this.provider=provider; this.verifier=verifier; this.clock=clock; this.policyVersion=policyVersion; this.mode=mode;
    }
    public ProviderResult execute(PaymentCommand c,String intentHash,String dossier) {
        boolean admitted=payments.transaction(() -> {
            payments.lockOrder(c.orderId());
            if (!payments.state(c.id()).equals("NOT_EXECUTED")) { payments.checkSame(c); return false; }
            if (payments.hasUnresolved(c.orderId())) throw CommerceException.held("A previous payment attempt must be reconciled first");
            validate(c);
            return payments.begin(c,intentHash,dossier);
        });
        if (!admitted) {
            var existing=payments.result(c.id());
            if (existing!=null) return existing;
            throw new CommerceException("INDETERMINATE","This command was already admitted. Reconcile it; do not create a new payment identity.",503);
        }
        try {
            var plan=executionPlan(c);
            var result=provider.execute(c,plan,commerce.line(plan,c.orderId()));
            if (!matches(c,result,null))
                throw new PayPalPaymentProvider.ProviderUncertainException();
            payments.complete(c.id(),result);
            return result;
        } catch (CommerceException e) { payments.fail(c.id()); throw e; }
        catch (Exception e) { payments.uncertain(c.id()); throw new CommerceException("INDETERMINATE","The provider outcome is uncertain. Reconciliation is required.",503); }
    }
    private void validate(PaymentCommand c) {
        var plan=executionPlan(c);
        var line=commerce.line(plan,c.orderId());
        if (!commerce.recordedCommandMatches(c) || !policyVersion.equals(c.policyVersion()) || plan.version()!=c.planVersion()
            || !line.merchantId().equals(c.merchantId()) || line.totalMinor()!=c.amountMinor() || !commerce.reservationMatches(c,plan)
            || plan.lines().stream().mapToLong(Line::totalMinor).sum()!=plan.totalMinor())
            throw CommerceException.held("Payment does not match the approved contract and reserved budget");
        var previous=payments.latest(c.orderId());
        switch(c.operation()) {
            case CREATE_ORDER -> {
                if (previous!=null) throw CommerceException.conflict("This merchant already has a checkout");
                if (!clock.instant().isBefore(plan.expiresAt())) throw CommerceException.held("The quote expired. Prepare and approve a new plan");
                if (!clock.instant().isBefore(plan.intent().eventAt())) throw CommerceException.held("The event time has passed");
                if (line.category()==Category.CATERING && plan.intent().eventAt().isAfter(clock.instant().plus(Duration.ofDays(3))))
                    throw CommerceException.held("Schedule checkout within three days of delivery for this MVP");
            }
            case CAPTURE_ORDER, AUTHORIZE_ORDER -> {
                if (previous==null || !previous.status().equals("APPROVAL_REQUIRED") || !Objects.equals(previous.providerOrderId(),c.providerResourceId()))
                    throw CommerceException.held("The buyer checkout is not ready");
                boolean capture=c.operation()==Operation.CAPTURE_ORDER;
                if (capture != (line.category()==Category.TENTS) || capture != line.paymentIntent().equals("CAPTURE"))
                    throw CommerceException.held("The command uses the wrong payment lifecycle");
                if (!clock.instant().isBefore(plan.expiresAt())) throw CommerceException.held("The reviewed quote expired before buyer approval");
            }
            case CAPTURE_AUTHORIZATION, VOID_AUTHORIZATION -> {
                if (line.category()!=Category.CATERING || previous==null || !previous.status().equals("AUTHORIZED")
                    || !Objects.equals(previous.authorizationId(),c.providerResourceId())) throw CommerceException.held("No matching catering authorization is available");
                if (c.operation()==Operation.CAPTURE_AUTHORIZATION) {
                    if (c.evidenceDigest()==null) throw CommerceException.held("A trusted delivery receipt is required");
                    var envelope=commerce.signedReceipt(c.orderId(),c.evidenceDigest());
                    if (!ReceiptVerifier.digest(envelope.payload()).equals(c.evidenceDigest())) throw CommerceException.held("Evidence digest mismatch");
                    verifier.verify(envelope,plan,line);
                }
            }
        }
    }
    private Plan executionPlan(PaymentCommand c) {
        return c.operation()==Operation.VOID_AUTHORIZATION?commerce.approvedForVoid(c.workflowId()):commerce.approvedForExecution(c.workflowId());
    }
    public GateResult reconcile(UUID id) {
        var command=payments.command(id);
        if (command==null) return new GateResult("NOT_EXECUTED","NOT_FORWARDED",null,null,null,null,"No provider attempt is recorded. Funds remain reserved.",null);
        var binding=payments.evidence(id);
        var result=payments.result(id);
        if (result==null || result.status().equals("PENDING")) {
            var observed=provider.reconcile(command,result);
            if (matches(command,observed,result)) {
                payments.complete(id,observed); result=observed;
            }
        }
        if (result!=null) return new GateResult("SUCCEEDED","FORWARDED",null,binding.dossierId(),binding.intentHash(),null,AgentSafeGateway.describe(result),result);
        return new GateResult("INDETERMINATE","INDETERMINATE",null,binding.dossierId(),binding.intentHash(),null,"Provider outcome is still unconfirmed. No new payment was sent.",null);
    }
    private static boolean matches(PaymentCommand c,ProviderResult observed,ProviderResult known) {
        if(observed==null || !c.merchantId().equals(observed.merchantId()) || c.amountMinor()!=observed.amountMinor()
            || !c.currency().equals(observed.currency()) || observed.providerOrderId()==null || observed.providerOrderId().isBlank()) return false;
        if((c.operation()==Operation.CAPTURE_ORDER || c.operation()==Operation.AUTHORIZE_ORDER)
            && !Objects.equals(c.providerResourceId(),observed.providerOrderId())) return false;
        if((c.operation()==Operation.CAPTURE_AUTHORIZATION || c.operation()==Operation.VOID_AUTHORIZATION)
            && !Objects.equals(c.providerResourceId(),observed.authorizationId())) return false;
        return known==null || (sameIfKnown(known.providerOrderId(),observed.providerOrderId())
            && sameIfKnown(known.authorizationId(),observed.authorizationId()) && sameIfKnown(known.captureId(),observed.captureId()));
    }
    private static boolean sameIfKnown(String known,String observed) { return known==null || known.equals(observed); }
}
