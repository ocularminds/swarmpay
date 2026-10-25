package com.swarmpay.agents;

import org.junit.jupiter.api.Test;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class AstraSettingsTest {
    @Test void supportsTheConfiguredAzureAliasesWithoutRoutingToPublicOpenAI() {
        var settings=AstraSettings.fromEnvironment(Map.of("SWARM_AI_PROVIDER","azure","AZURE_OPENAI_LLM","gpt-6-astra",
            "AZURE_OPEANAI_KEY","fixture-azure-key","AZURE_OPENAI_URL","https://fixture.openai.azure.com/openai/v1"));
        assertEquals("https://fixture.openai.azure.com/openai/v1/",settings.baseUrl());
        assertEquals("gpt-6-astra",settings.deployment());assertEquals("fixture-azure-key",settings.apiKey());
        assertFalse(settings.toString().contains(settings.apiKey()));assertFalse(settings.toString().contains("fixture.openai"));
    }
    @Test void refusesCredentialRedirectsAndLegacyDeploymentPaths() {
        for(String url:new String[]{"http://fixture.openai.azure.com","https://attacker.example/openai/v1",
            "https://fixture.openai.azure.com/openai/v1?api-key=secret","https://fixture.openai.azure.com/openai/deployments/test"})
            assertThrows(IllegalStateException.class,()->AstraSettings.azureBaseUrl(url));
        assertEquals("https://fixture.services.ai.azure.com/openai/v1/",AstraSettings.azureBaseUrl("https://fixture.services.ai.azure.com/"));
    }
    @Test void missingAzureConfigurationNeverFallsBackToDemoOrAnotherKey() {
        assertThrows(IllegalStateException.class,()->AstraSettings.fromEnvironment(Map.of("SWARM_AI_PROVIDER","azure","OPENAI_API_KEY","other-provider-key")));
        assertEquals("demo",AstraSettings.fromEnvironment(Map.of("SWARM_MODE","demo")).provider());
    }
}
