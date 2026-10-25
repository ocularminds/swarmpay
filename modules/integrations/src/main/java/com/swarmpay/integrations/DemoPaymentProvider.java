package com.swarmpay.integrations;

import com.swarmpay.domain.Commerce.*;

/** Deterministic provider fixture. No PayPal client or credential is used. */
public final class DemoPaymentProvider implements PaymentProvider {
    @Override public ProviderResult execute(PaymentCommand c, Plan plan, Line line) {
        String id = c.orderId().toString();
        return switch (c.operation()) {
            case CREATE_ORDER -> result(c, "APPROVAL_REQUIRED", "DEMO-ORDER-"+id, null, null);
            case CAPTURE_ORDER -> result(c, "CAPTURED", c.providerResourceId(), null, "DEMO-CAPTURE-"+id);
            case AUTHORIZE_ORDER -> result(c, "AUTHORIZED", c.providerResourceId(), "DEMO-AUTH-"+id, null);
            case CAPTURE_AUTHORIZATION -> result(c, "CAPTURED", "DEMO-ORDER-"+id, c.providerResourceId(), "DEMO-CAPTURE-"+id);
            case VOID_AUTHORIZATION -> result(c, "VOIDED", "DEMO-ORDER-"+id, c.providerResourceId(), null);
        };
    }
    @Override public ProviderResult reconcile(PaymentCommand c, ProviderResult lastKnownResult) { return null; }
    private ProviderResult result(PaymentCommand c, String status, String order, String authorization, String capture) {
        return new ProviderResult(status,order,authorization,capture,null,c.amountMinor(),c.currency(),c.merchantId(),"SIMULATED_PAYPAL");
    }
}
