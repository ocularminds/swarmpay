package com.swarmpay.integrations;

import com.swarmpay.domain.Commerce.*;
import com.swarmpay.integrations.PayPalHttpFixture.Response;
import org.junit.jupiter.api.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class AgentSafeGatewayTest {
    final UUID workflow=UUID.randomUUID();
    final PaymentCommand command=new PaymentCommand(UUID.randomUUID(),workflow,1,UUID.randomUUID(),Operation.CREATE_ORDER,"tents",50000,"USD",null,null,workflow.toString(),"swarm-pay-sandbox-v1");
    PayPalHttpFixture gateway;
    @BeforeEach void start() throws Exception {
        gateway=new PayPalHttpFixture();
        gateway.handler=r->new Response(403,Map.of("state","BLOCK","execution","NOT_FORWARDED"),Map.of("agentsafe-execution","NOT_FORWARDED"));
    }
    @AfterEach void stop() { gateway.close(); }

    @Test void aLocalGatewayReceivesTheExecutorTokenAndNoTenantKey() {
        var result=new AgentSafeGateway(gateway.base().toString(),"executor-token").execute(command);
        assertEquals("BLOCK",result.state());
        var request=gateway.requests.getFirst();
        assertEquals("Bearer executor-token",request.header("Authorization"));
        assertNull(request.header("AgentSafe-Tenant-Key"));
    }

    @Test void anEnforcingHostedGatewayReceivesOnlyTheTenantKey() {
        new AgentSafeGateway(gateway.base().toString()," ","tenant-key").execute(command);
        var request=gateway.requests.getFirst();
        assertNull(request.header("Authorization"),"The hosted gateway holds the executor token; the app sends none");
        assertEquals("tenant-key",request.header("AgentSafe-Tenant-Key"));
    }

    @Test void aShadowHostedGatewayReceivesBoth() {
        new AgentSafeGateway(gateway.base().toString(),"executor-token","tenant-key").reconcile(command);
        var request=gateway.requests.getFirst();
        assertEquals("Bearer executor-token",request.header("Authorization"));
        assertEquals("tenant-key",request.header("AgentSafe-Tenant-Key"));
    }

    @Test void aHostedGatewayWithoutTheTenantKeyOrAGatewayWithNoCredentialIsRefusedAtStart() {
        assertThrows(IllegalStateException.class,()->new AgentSafeGateway("https://swarm.decionisedge.com","executor-token"));
        assertThrows(IllegalStateException.class,()->new AgentSafeGateway("https://swarm.decionisedge.com","executor-token","  "));
        assertThrows(IllegalStateException.class,()->new AgentSafeGateway(gateway.base().toString(),null,null));
    }
}
