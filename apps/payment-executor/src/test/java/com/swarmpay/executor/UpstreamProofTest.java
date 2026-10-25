package com.swarmpay.executor;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.junit.jupiter.api.Assertions.*;

class UpstreamProofTest {
    final ExecutorSecurity.ExecutorAccessFilter filter=new ExecutorSecurity.ExecutorAccessFilter("executor-token");

    MockHttpServletResponse dispatch(String method,String path) throws Exception {
        var response=new MockHttpServletResponse();var chain=new MockFilterChain();
        filter.doFilter(new MockHttpServletRequest(method,path),response,chain);
        if (chain.getRequest()!=null && response.getStatus()==200) response.setStatus(299); // reached the controller
        return response;
    }

    @Test void theProofIsServedWithoutCredentialsAndNothingElseNewIsPublic() throws Exception {
        assertEquals(299,dispatch("GET",UpstreamProofController.PATH).getStatus());
        assertEquals(405,dispatch("POST",UpstreamProofController.PATH).getStatus());
        assertEquals(404,dispatch("GET","/.well-known/agentsafe-upstream/x").getStatus());
        assertEquals(404,dispatch("GET","/.well-known/other").getStatus());
        assertEquals(401,dispatch("POST","/internal/payments/commands").getStatus());
        assertEquals(401,dispatch("GET","/internal/payments/commands/1").getStatus());
    }

    @Test void aCommandStillNeedsTheTokenAndTheGatewaysAuthorityBinding() throws Exception {
        var request=new MockHttpServletRequest("POST","/internal/payments/commands");
        request.addHeader("Authorization","Bearer executor-token");
        var response=new MockHttpServletResponse();
        filter.doFilter(request,response,new MockFilterChain());
        assertEquals(403,response.getStatus());
    }

    @Test void theControllerServesTheConfiguredTokenAsPlainTextOrNothing() {
        var served=new UpstreamProofController("v1.1761390000.abcdefghijklmnopqrstuv").proof();
        assertEquals(200,served.getStatusCode().value());
        assertEquals("v1.1761390000.abcdefghijklmnopqrstuv\n",served.getBody());
        assertEquals("text/plain;charset=UTF-8",served.getHeaders().getContentType().toString());
        assertEquals(404,new UpstreamProofController(null).proof().getStatusCode().value());
        assertEquals(404,new UpstreamProofController("  ").proof().getStatusCode().value());
        assertThrows(IllegalStateException.class,()->new UpstreamProofController("x".repeat(1025)));
    }
}
