package com.swarmpay.app;

import com.swarmpay.agents.*;
import com.swarmpay.domain.Commerce.*;
import com.swarmpay.domain.PlanFactory;
import com.swarmpay.integrations.*;
import com.swarmpay.mcp.CommerceTools;
import com.swarmpay.persistence.CommerceRepository;
import com.swarmpay.persistence.RuntimeBinding;
import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.ai.tool.method.MethodToolCallbackProvider;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;
import javax.sql.DataSource;
import java.nio.file.*;
import java.time.Clock;

@SpringBootApplication
@EnableScheduling
public class CommerceApplication {
    public static void main(String[] args) { SpringApplication.run(CommerceApplication.class,args); }
    @Bean Clock clock() { return Clock.systemUTC(); }
    @Bean String runtimeMode() { return RuntimeSettings.mode(); }
    @Bean Catalog catalog() { return new DemoCatalog(); }
    @Bean PlanFactory planFactory(Clock clock) { return new PlanFactory(clock); }
    @Bean CommerceRepository repository(DataSource db) { return new CommerceRepository(db); }
    @Bean org.springframework.boot.ApplicationRunner bindMode(DataSource db,String runtimeMode) {
        return args -> RuntimeBinding.verify(db,"commerce",runtimeMode);
    }
    @Bean AgentPlanner planner() { return new DemoPlanner(); }
    @Bean IntentInterpreter interpreter(AgentPlanner planner) { return planner instanceof IntentInterpreter interpreter?interpreter:new DemoInterpreter(); }
    @Bean ReceiptVerifier receiptVerifier(Clock clock) throws Exception {
        return new ReceiptVerifier(ReceiptVerifier.publicKey(Files.readString(Path.of(RuntimeSettings.required("VENUE_PUBLIC_KEY_FILE")))),RuntimeSettings.required("VENUE_ISSUER"),clock);
    }
    @Bean AuthorityGateway authority() { return new AgentSafeGateway(RuntimeSettings.required("AGENTSAFE_URL"),RuntimeSettings.secret("EXECUTOR_TOKEN")); }
    @Bean ToolCallbackProvider commerceTools(WorkflowService workflows) {
        return MethodToolCallbackProvider.builder().toolObjects(new CommerceTools(workflows.forAgent(RuntimeSettings.required("ORGANIZER_USERNAME")))).build();
    }
}
