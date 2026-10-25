package com.swarmpay.executor;

import com.swarmpay.domain.CommerceException;
import com.swarmpay.integrations.*;
import com.swarmpay.persistence.PaymentRepository;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
class WebhookController {
    private final PaymentRepository db;
    private final PaymentService service;
    private final PayPalWebhookVerifier verifier;
    WebhookController(PaymentRepository db,PaymentService service,String runtimeMode) {
        this.db=db; this.service=service;
        verifier=runtimeMode.equals("sandbox")?new PayPalWebhookVerifier(RuntimeSettings.merchants()):null;
    }
    @PostMapping("/internal/webhooks/{merchant}")
    Map<String,Object> receive(@PathVariable String merchant,@RequestBody String raw,@RequestHeader Map<String,String> headers) {
        if(verifier==null) throw new CommerceException("SANDBOX_ONLY","PayPal webhooks are enabled only in sandbox mode",404);
        var event=verifier.verify(merchant,raw,headers);
        String id=event.path("id").asText(), type=event.path("event_type").asText(), resource=event.path("resource").path("id").asText();
        if(id.isBlank() || resource.isBlank()) throw CommerceException.invalid("Invalid PayPal event identity");
        var related=event.path("resource").path("supplementary_data").path("related_ids");
        var candidates=new LinkedHashMap<UUID,com.swarmpay.domain.Commerce.PaymentCommand>();
        for(String reference:List.of(resource,related.path("order_id").asText(),related.path("authorization_id").asText())) {
            if(!reference.isBlank()) db.commandsForResource(merchant,reference).forEach(c -> candidates.put(c.id(),c));
        }
        if(candidates.isEmpty()) throw new CommerceException("UNKNOWN_PAYMENT","Webhook resource is not associated with this merchant's recorded payments",422);
        boolean added=db.addWebhook(id,merchant,raw);
        // A notification is only a prompt to read PayPal. Event order never determines payment state.
        // Replayed delivery also resumes reads if a previous process stopped after
        // the inbox insert. Reads never initiate a new payment.
        candidates.keySet().forEach(service::reconcile);
        return Map.of("accepted",true,"duplicate",!added,"eventType",type);
    }
}
