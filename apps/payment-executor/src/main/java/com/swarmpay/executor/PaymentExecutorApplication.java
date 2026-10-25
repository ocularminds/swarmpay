package com.swarmpay.executor;

import com.swarmpay.integrations.RuntimeSettings;
import com.swarmpay.persistence.RuntimeBinding;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import javax.sql.DataSource;

@SpringBootApplication
public class PaymentExecutorApplication {
    public static void main(String[] args) { SpringApplication.run(PaymentExecutorApplication.class,args); }
    @Bean String runtimeMode() { return RuntimeSettings.mode(); }
    @Bean org.springframework.boot.ApplicationRunner bindMode(DataSource db,String runtimeMode) {
        return args -> RuntimeBinding.verify(db,"payments",runtimeMode);
    }
}
