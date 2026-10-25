package com.swarmpay.executor;

import com.swarmpay.domain.Commerce.*;
import com.swarmpay.domain.CommerceException;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
import java.util.UUID;

@RestController
class PaymentController {
    private final PaymentService payments;
    PaymentController(PaymentService payments) { this.payments=payments; }
    @PostMapping("/internal/payments/commands")
    ProviderResult execute(@RequestBody PaymentCommand command,@RequestHeader("x-agent-safe-intent-hash") String hash,
                           @RequestHeader("x-agent-safe-dossier-id") String dossier,@RequestHeader("x-agent-safe-decision-id") String decision,HttpServletResponse response) {
        response.setHeader("swarm-decision-id",decision);
        return payments.execute(command,hash,dossier);
    }
    @GetMapping("/internal/payments/commands/{id}") GateResult reconcile(@PathVariable UUID id) { return payments.reconcile(id); }
}
@RestControllerAdvice
class ExecutorErrors {
    @ExceptionHandler(CommerceException.class) ResponseEntity<Map<String,String>> commerce(CommerceException e) { return ResponseEntity.status(e.status()).body(Map.of("code",e.code(),"message",e.getMessage())); }
    @ExceptionHandler({IllegalArgumentException.class,org.springframework.http.converter.HttpMessageNotReadableException.class})
    ResponseEntity<Map<String,String>> invalid(Exception e) { return ResponseEntity.badRequest().body(Map.of("code","INVALID_REQUEST","message","Invalid payment command")); }
}
