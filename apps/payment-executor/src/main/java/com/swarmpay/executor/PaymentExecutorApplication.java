package com.swarmpay.executor;

import com.swarmpay.domain.Commerce.*;
import com.swarmpay.integrations.*;
import com.swarmpay.persistence.*;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import javax.sql.DataSource;
import java.nio.file.*;
import java.time.Clock;

@SpringBootApplication
public class PaymentExecutorApplication {
    public static void main(String[] args) { SpringApplication.run(PaymentExecutorApplication.class,args); }
    @Bean Clock clock() { return Clock.systemUTC(); }
    @Bean String runtimeMode() { return RuntimeSettings.mode(); }
    @Bean CommerceRepository commerceRepository(DataSource db) { return new CommerceRepository(db); }
    @Bean PaymentRepository paymentRepository(DataSource db) { return new PaymentRepository(db); }
    @Bean org.springframework.boot.ApplicationRunner bindMode(DataSource db,String runtimeMode) {
        return args -> RuntimeBinding.verify(db,"payments",runtimeMode);
    }
    @Bean ReceiptVerifier receiptVerifier(Clock clock) throws Exception {
        return new ReceiptVerifier(ReceiptVerifier.publicKey(RuntimeSettings.venuePublicKey()),
            RuntimeSettings.required("VENUE_ISSUER"),clock);
    }
    @Bean PaymentProvider paymentProvider(PaymentRepository db,String runtimeMode) {
        if (runtimeMode.equals("demo")) return new DemoPaymentProvider();
        return new PayPalPaymentProvider(RuntimeSettings.merchants(),id -> { var result=db.latest(id); return result==null?null:result.providerOrderId(); });
    }
    @Bean PaymentService paymentService(CommerceRepository commerce,PaymentRepository payments,PaymentProvider provider,ReceiptVerifier verifier,Clock clock,String runtimeMode) {
        return new PaymentService(commerce,payments,provider,verifier,clock,RuntimeSettings.required("DECIONIS_POLICY_VERSION"),runtimeMode);
    }
}
