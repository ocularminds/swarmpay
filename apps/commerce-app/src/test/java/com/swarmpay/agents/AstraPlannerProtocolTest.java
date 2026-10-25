package com.swarmpay.agents;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.swarmpay.domain.CommerceException;
import com.swarmpay.domain.Commerce.Intent;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

/** Run on the application classpath, where Spring AI and OpenAI resolve different schema-generator versions. */
class AstraPlannerProtocolTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String INTENT = """
        {"attendees":30,"tents":5,"budgetMinor":150000,"venue":null,"weather":"Rain","eventDate":null,"clarifications":["Where and when?"]}
        """;
    private HttpServer server;
    private AstraPlanner planner;
    private volatile JsonNode request;
    private volatile String answer = INTENT;
    private volatile String status = "completed";
    private volatile int httpStatus = 200;
    private final AtomicInteger calls = new AtomicInteger();

    @BeforeEach void startProvider() throws Exception {
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/openai/v1/responses",exchange -> {
            calls.incrementAndGet();
            request=JSON.readTree(exchange.getRequestBody());
            String body=httpStatus==200 ? JSON.writeValueAsString(Map.of("id","resp_fixture","object","response","status",status,
                "output",new Object[]{Map.of("id","msg_fixture","type","message","role","assistant","status","completed",
                    "content",new Object[]{Map.of("type","output_text","text",answer,"annotations",new Object[]{})})}))
                : "{\"error\":{\"message\":\"private provider diagnostic\",\"type\":\"invalid_request_error\",\"code\":\"deployment_missing\"}}";
            byte[] bytes=body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type","application/json");
            exchange.sendResponseHeaders(httpStatus,bytes.length);
            exchange.getResponseBody().write(bytes);exchange.close();
        });
        server.start();
        planner=new AstraPlanner(new AstraSettings("azure","fixture-key","http://127.0.0.1:"+server.getAddress().getPort()+"/openai/v1/","gpt-6-astra"),Clock.systemUTC());
    }
    @AfterEach void stopProvider() { if(planner!=null)planner.close();if(server!=null)server.stop(0); }

    @Test void sendsStrictSchemaAndParsesNullableIntentOnTheMcpApplicationClasspath() {
        var result=planner.interpret("30 guests, five rental tents, $1,500, rain","UTC");
        assertEquals(30,result.attendees());assertEquals(150000L,result.budgetMinor());assertNull(result.eventDate());
        assertEquals("Azure OpenAI · gpt-6-astra",result.source());
        assertEquals("gpt-6-astra",request.path("model").asText());
        assertFalse(request.path("store").asBoolean(true));assertFalse(request.has("tools"));
        assertEquals(2200,request.path("max_output_tokens").asInt());
        assertTrue(request.at("/text/format/strict").asBoolean());
        assertEquals("json_schema",request.at("/text/format/type").asText());
        assertFalse(request.at("/text/format/schema/additionalProperties").asBoolean(true));
        assertEquals(7,request.at("/text/format/schema/required").size());
        assertEquals("null",request.at("/text/format/schema/properties/eventDate/type/1").asText());
        assertEquals(1,calls.get());
    }
    @Test void rejectsTruncatedUnknownAndCoercedResultsWithoutRetrying() {
        status="incomplete";
        assertEquals("MODEL_OUTPUT_INVALID",assertThrows(CommerceException.class,()->planner.interpret("event","UTC")).code());
        status="completed";answer=INTENT.replace("\"attendees\":30","\"attendees\":\"30\"");
        assertEquals("MODEL_OUTPUT_INVALID",assertThrows(CommerceException.class,()->planner.interpret("event","UTC")).code());
        answer=INTENT.replace("\"attendees\":30,", "\"unapprovedField\":30,");
        assertEquals("MODEL_OUTPUT_INVALID",assertThrows(CommerceException.class,()->planner.interpret("event","UTC")).code());
        assertEquals(3,calls.get());
    }
    @Test void returnsBothAdvisoryReportsWithTheirProviderSource() {
        answer="{\"summary\":\"Review the confirmed event.\",\"facts\":[\"Catalog prices are fixtures.\"]}";
        var result=planner.assess(new Intent("A meetup",30,5,150000,Instant.now().plusSeconds(3600),"UTC","Test venue","Rain","RENT"),List.of());
        assertEquals(List.of("Sourcing","Risk & milestones"),result.stream().map(r -> r.role()).toList());
        assertTrue(result.stream().allMatch(r -> r.source().equals("Azure OpenAI · gpt-6-astra")));
        assertEquals(2,request.at("/text/format/schema/required").size());assertEquals(2,calls.get());
    }
    @Test void reportsOnlySafeProviderStatusAndDoesNotFallback() {
        httpStatus=404;
        var error=assertThrows(CommerceException.class,()->planner.interpret("event","UTC"));
        assertEquals("MODEL_UNAVAILABLE",error.code());assertTrue(error.getMessage().contains("HTTP 404"));
        assertFalse(error.getMessage().contains("private provider diagnostic"));assertEquals(1,calls.get());
    }
}
