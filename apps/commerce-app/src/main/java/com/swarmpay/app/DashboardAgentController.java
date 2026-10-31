package com.swarmpay.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.swarmpay.agents.AstraSettings;
import com.swarmpay.integrations.Json;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.Map;
import java.util.Set;

/**
 * The AG Studio dashboard agent's only route to a model. Studio's adapter runs in the organizer's browser and
 * posts OpenAI Responses requests here; this adds the Azure credential, which never reaches the browser, and
 * streams the reply back. The agent works on the dashboard's data and Studio's own tools: it has no payment
 * tool, and hosted tools such as web search or file search are dropped, so it cannot reach anything else.
 */
@RestController
class DashboardAgentController {
    static final int MAX_OUTPUT_TOKENS = 16_000;
    private static final Set<String> FORWARDED = Set.of("input","instructions","tools","tool_choice","text","reasoning","parallel_tool_calls");
    private final AstraSettings ai;
    // The JVM's proxy settings route this through the egress proxy, which admits the model host alone.
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
    DashboardAgentController(AstraSettings ai) { this.ai = ai; }

    @PostMapping("/api/ai/responses")
    ResponseEntity<StreamingResponseBody> respond(@RequestBody String raw) throws Exception {
        if (ai.provider().equals("demo")) return error(HttpStatus.SERVICE_UNAVAILABLE, "The dashboard agent needs Azure OpenAI; this demo uses simulated agents.");
        JsonNode body;
        try { body = Json.MAPPER.readTree(raw); } catch (Exception e) { return error(HttpStatus.BAD_REQUEST, "The request must be JSON."); }
        if (!(body instanceof ObjectNode request)) return error(HttpStatus.BAD_REQUEST, "The request must be a JSON object.");
        var upstream = http.send(HttpRequest.newBuilder(URI.create(ai.baseUrl() + "responses")).timeout(Duration.ofSeconds(140))
            .header("Content-Type","application/json").header("Authorization","Bearer " + ai.apiKey())
            .POST(HttpRequest.BodyPublishers.ofString(Json.MAPPER.writeValueAsString(sanitize(request, ai.deployment())))).build(),
            HttpResponse.BodyHandlers.ofInputStream());
        // A stream on success; on failure the adapter reads error.message from the JSON body.
        String type = upstream.headers().firstValue("Content-Type").orElse(MediaType.APPLICATION_JSON_VALUE);
        StreamingResponseBody stream = out -> { try (var in = upstream.body()) { in.transferTo(out); } };
        return ResponseEntity.status(upstream.statusCode()).header("Content-Type", type).header("Cache-Control","no-store").body(stream);
    }

    /** Only the conversation and Studio's function tools reach the model, on SwarmPay's deployment, streamed and bounded. */
    static ObjectNode sanitize(ObjectNode request, String deployment) {
        var safe = Json.MAPPER.createObjectNode();
        request.fields().forEachRemaining(field -> { if (FORWARDED.contains(field.getKey())) safe.set(field.getKey(), field.getValue()); });
        if (safe.path("tools").isArray()) {
            var tools = Json.MAPPER.createArrayNode();
            for (var tool : safe.path("tools")) if ("function".equals(tool.path("type").asText())) tools.add(tool);
            safe.set("tools", tools);
        }
        safe.put("model", deployment).put("stream", true).put("store", false).put("max_output_tokens", MAX_OUTPUT_TOKENS);
        return safe;
    }

    private static ResponseEntity<StreamingResponseBody> error(HttpStatus status, String message) {
        byte[] json = Json.write(Map.of("error", Map.of("message", message))).getBytes(java.nio.charset.StandardCharsets.UTF_8);
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).header("Cache-Control","no-store").body(out -> out.write(json));
    }
}
