package com.swarmpay.app;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.swarmpay.integrations.Json;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class DashboardAgentControllerTest {
    @Test void theDashboardAgentReachesOnlySwarmPaysDeploymentWithStudiosOwnTools() throws Exception {
        var request=(ObjectNode)Json.MAPPER.readTree("""
            {"model":"gpt-5.4","input":[{"role":"user","content":"What did I pay?"}],"stream":false,"store":true,"max_output_tokens":999999,
             "previous_response_id":"resp_other","background":true,"metadata":{"x":"y"},
             "tools":[{"type":"function","name":"add_widget","parameters":{}},{"type":"web_search"},{"type":"file_search","vector_store_ids":["vs"]},{"type":"mcp","server_url":"https://evil.test"}],
             "text":{"format":{"type":"text"}},"reasoning":{"effort":"medium"},"parallel_tool_calls":true}
            """);
        var safe=DashboardAgentController.sanitize(request,"swarm-astra");
        assertEquals("swarm-astra",safe.path("model").asText());
        assertTrue(safe.path("stream").asBoolean()); assertFalse(safe.path("store").asBoolean());
        assertEquals(DashboardAgentController.MAX_OUTPUT_TOKENS,safe.path("max_output_tokens").asInt());
        assertEquals(1,safe.path("tools").size()); assertEquals("add_widget",safe.path("tools").get(0).path("name").asText());
        for(String dropped:new String[]{"previous_response_id","background","metadata"}) assertFalse(safe.has(dropped),dropped);
        assertEquals("What did I pay?",safe.path("input").get(0).path("content").asText());
        assertEquals("medium",safe.path("reasoning").path("effort").asText());
    }
}
