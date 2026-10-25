package com.swarmpay.app;

import com.swarmpay.domain.Commerce.Catalog;
import com.swarmpay.integrations.DemoCatalog;
import com.swarmpay.integrations.RuntimeSettings;
import com.swarmpay.mcp.CommerceTools;
import com.swarmpay.persistence.RuntimeBinding;
import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.ai.tool.method.MethodToolCallbackProvider;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import javax.sql.DataSource;

@SpringBootApplication
public class CommerceApplication {
    public static void main(String[] args) { SpringApplication.run(CommerceApplication.class,args); }
    @Bean String runtimeMode() { return RuntimeSettings.mode(); }
    @Bean Catalog catalog() { return new DemoCatalog(); }
    @Bean org.springframework.boot.ApplicationRunner bindMode(DataSource db,String runtimeMode) {
        return args -> RuntimeBinding.verify(db,"commerce",runtimeMode);
    }
    @Bean ToolCallbackProvider commerceTools(Catalog catalog) {
        return MethodToolCallbackProvider.builder().toolObjects(new CommerceTools(catalog)).build();
    }
}
