package com.swarmpay.app;

import com.swarmpay.agents.*;
import com.swarmpay.domain.Commerce.*;
import com.swarmpay.domain.PlanFactory;
import com.swarmpay.integrations.*;
import com.swarmpay.mcp.CommerceTools;
import com.swarmpay.persistence.AgentTokens;
import com.swarmpay.persistence.CommerceRepository;
import com.swarmpay.persistence.OrganizerAccounts;
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
    public static void main(String[] args) { RuntimeSettings.egressProxy(); SpringApplication.run(CommerceApplication.class,args); }
    @Bean Clock clock() { return Clock.systemUTC(); }
    @Bean String runtimeMode() { return RuntimeSettings.mode(); }
    /** Curated rentals and catering; with a Channel3 key, tents to buy from Channel3's product data as well. */
    @Bean Catalog catalog() {
        var channel3=RuntimeSettings.optionalSecret("CHANNEL3_API_KEY");
        return channel3==null?new DemoCatalog():new Channel3Catalog(new DemoCatalog(),channel3);
    }
    @Bean PlanFactory planFactory(Clock clock) { return new PlanFactory(clock); }
    @Bean CommerceRepository repository(DataSource db) { return new CommerceRepository(db); }
    @Bean OrganizerAccounts organizerAccounts(DataSource db) { return new OrganizerAccounts(db); }
    @Bean AgentTokens agentTokens(DataSource db) { return new AgentTokens(db); }
    @Bean org.springframework.boot.ApplicationRunner bindMode(DataSource db,String runtimeMode) {
        return args -> RuntimeBinding.verify(db,"commerce",runtimeMode);
    }
    @Bean AstraSettings aiSettings() { return AstraSettings.fromEnvironment(System.getenv()); }
    @Bean AgentPlanner planner(AstraSettings settings,Clock clock) {
        return settings.provider().equals("demo")?new DemoPlanner():new AstraPlanner(settings,clock);
    }
    @Bean IntentInterpreter interpreter(AgentPlanner planner) { return planner instanceof IntentInterpreter interpreter?interpreter:new DemoInterpreter(); }
    @Bean ReceiptVerifier receiptVerifier(Clock clock) throws Exception {
        return new ReceiptVerifier(ReceiptVerifier.publicKey(RuntimeSettings.venuePublicKey()),RuntimeSettings.required("VENUE_ISSUER"),clock);
    }
    @Bean AuthorityGateway authority() {
        return new AgentSafeGateway(RuntimeSettings.serviceUrl("AGENTSAFE_URL","AGENTSAFE_HOSTPORT"),RuntimeSettings.optionalSecret("EXECUTOR_TOKEN"),
            RuntimeSettings.optionalSecret("AGENTSAFE_TENANT_KEY"));
    }
    @Bean ToolCallbackProvider commerceTools(WorkflowService workflows) {
        return MethodToolCallbackProvider.builder().toolObjects(new CommerceTools(new CurrentAgent(workflows))).build();
    }
}
