package com.swarmpay.app;

import com.swarmpay.domain.CommerceException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.junit.jupiter.api.Assertions.*;

class WebOriginFilterTest {
    private final WebAccessPolicy hosted = new WebAccessPolicy("https://swarm.decionis.com", true);

    @Test void sameOriginAndNonBrowserClientsReachTheAuthenticatedRoutes() throws Exception {
        for (String path : new String[]{"/api/session", "/api/plans", "/mcp"}) {
            var request = request(path, "swarm.decionis.com");
            request.addHeader("Origin", "https://swarm.decionis.com");
            assertEquals(204, dispatch(hosted, request).getStatus());
            request.removeHeader("Origin");
            assertEquals(204, dispatch(hosted, request).getStatus());
        }
    }

    @ParameterizedTest @ValueSource(strings={"https://attacker.test", "http://swarm.decionis.com", "null",
        "https://swarm.decionis.com.attacker.test", "https://swarm.decionis.com:444", "https://swarm.decionis.com/",
        "https://swarm.decionis.com https://attacker.test", "https://swarm.decionis.com@attacker.test"})
    void aBrowserOriginCannotBeForgedOrBroadened(String origin) throws Exception {
        var request = request("/mcp", "swarm.decionis.com");
        request.addHeader("Origin", origin);
        var response = dispatch(hosted, request);
        assertEquals(403, response.getStatus());
        assertTrue(response.getContentAsString().contains("INVALID_ORIGIN"));
    }

    @ParameterizedTest @ValueSource(strings={"attacker.test", "localhost", "swarm.decionis.com:444",
        "swarm.decionis.com.attacker.test", "swarm.decionis.com.", "swarm.decionis.com/path", "swarm.decionis.com@attacker.test"})
    void forwardedHeadersCannotBypassTheConfiguredHost(String host) throws Exception {
        var request = request("/api/session", host);
        request.addHeader("Forwarded", "host=swarm.decionis.com;proto=https");
        request.addHeader("X-Forwarded-Host", "swarm.decionis.com");
        request.addHeader("X-Forwarded-Proto", "https");
        var response = dispatch(hosted, request);
        assertEquals(403, response.getStatus());
        assertTrue(response.getContentAsString().contains("INVALID_HOST"));
    }

    @Test void duplicatedHeadersAndMissingHostAreRejected() throws Exception {
        var request = request("/mcp", "swarm.decionis.com");
        request.addHeader("Origin", "https://swarm.decionis.com");
        request.addHeader("Origin", "https://swarm.decionis.com");
        assertEquals(403, dispatch(hosted, request).getStatus());
        request.removeHeader("Origin");
        request.addHeader("Host", "swarm.decionis.com");
        assertEquals(403, dispatch(hosted, request).getStatus());
        request.removeHeader("Host");
        assertEquals(403, dispatch(hosted, request).getStatus());
    }

    @Test void caseAndTheDefaultTlsPortRetainTheSameOrigin() throws Exception {
        var request = request("/api/session", "SWARM.DECIONIS.COM:443");
        request.addHeader("Origin", "https://SWARM.DECIONIS.COM:443");
        var response = dispatch(hosted, request);
        assertEquals(204, response.getStatus());
        assertEquals("max-age=31536000", response.getHeader("Strict-Transport-Security"));
    }

    @Test void localMcpRejectsDnsRebindingAndDifferentBrowserPorts() throws Exception {
        var local = new WebAccessPolicy("", false);
        var request = request("/mcp", "localhost:5173");
        request.addHeader("Origin", "http://localhost:5173");
        assertEquals(204, dispatch(local, request).getStatus());
        request.removeHeader("Origin");
        request.addHeader("Origin", "http://localhost:9000");
        assertEquals(403, dispatch(local, request).getStatus());
        request.removeHeader("Origin");
        request.removeHeader("Host");
        request.addHeader("Host", "attacker.test:5173");
        assertEquals(403, dispatch(local, request).getStatus());
    }

    @Test void privateContainerProbesDoNotNeedThePublicHost() throws Exception {
        assertEquals(204, dispatch(hosted, request("/actuator/health", "10.0.1.25:8080")).getStatus());
    }

    @Test void hostedDemoCannotCreateAnAnonymousOrganizerSession() {
        var request = request("/api/demo-session", "swarm.decionis.com");
        var controller = new SessionController("demo", null, hosted, null, null);
        var error = assertThrows(CommerceException.class, () -> controller.demo(request, new MockHttpServletResponse()));
        assertEquals("DEMO_DISABLED", error.code());
        assertNull(request.getSession(false));
    }

    @Test void insecureHostedConfigurationFailsAtStartup() {
        new ApplicationContextRunner().withUserConfiguration(WebAccessConfiguration.class)
            .withPropertyValues("swarm.public-origin=https://swarm.decionis.com")
            .run(context -> assertNotNull(context.getStartupFailure()));
        new ApplicationContextRunner().withUserConfiguration(WebAccessConfiguration.class)
            .withPropertyValues("swarm.public-origin=https://swarm.decionis.com", "server.servlet.session.cookie.secure=true")
            .run(context -> assertTrue(context.getBean(WebAccessPolicy.class).hosted()));
    }

    @ParameterizedTest @ValueSource(strings={"http://swarm.decionis.com", "https://user:password@swarm.decionis.com",
        "https://swarm.decionis.com/path", "https://swarm.decionis.com?query=yes", "https://swarm.decionis.com#fragment",
        "https://swarm.decionis.com:0", "https://swarm.decionis.com:65536", "not-an-origin"})
    void invalidDeploymentOriginsCannotStart(String origin) {
        assertThrows(IllegalArgumentException.class, () -> new WebAccessPolicy(origin, true));
    }

    private static MockHttpServletRequest request(String path, String host) {
        var request = new MockHttpServletRequest("POST", path);
        request.addHeader("Host", host);
        return request;
    }

    private static MockHttpServletResponse dispatch(WebAccessPolicy policy, MockHttpServletRequest request) throws Exception {
        var response = new MockHttpServletResponse();
        new WebOriginFilter(policy).doFilter(request, response, (q, s) -> ((MockHttpServletResponse)s).setStatus(204));
        return response;
    }
}
