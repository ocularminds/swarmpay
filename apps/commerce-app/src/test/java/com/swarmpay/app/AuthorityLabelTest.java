package com.swarmpay.app;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class AuthorityLabelTest {
    @Test void theLabelNamesTheAuthorityThatActuallyDecides() {
        assertEquals("AgentSafe · local test authority",SessionController.authority("http://agentsafe:8082","demo"));
        assertEquals("AgentSafe · Decionis",SessionController.authority("http://agentsafe:8082","sandbox"));
        // The shared hosted gateway asks Decionis even while payments are simulated.
        assertEquals("AgentSafe hosted gateway · Decionis",SessionController.authority("https://swarm.decionisedge.com","demo"));
        assertEquals("AgentSafe hosted gateway · Decionis",SessionController.authority("https://swarm.decionisedge.com","sandbox"));
    }
}
