package com.swarmpay.app;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class AuthorityLabelTest {
    @Test void theLabelNamesTheAuthorityThatActuallyDecides() {
        assertEquals("AgentSafe · local test authority",SessionController.authority("http://agentsafe:8082","local"));
        assertEquals("AgentSafe · Decionis",SessionController.authority("http://agentsafe:8082","decionis"));
        // The shared hosted gateway asks Decionis even while payments are simulated.
        assertEquals("AgentSafe hosted gateway · Decionis",SessionController.authority("https://swarm.decionisedge.com","local"));
        assertEquals("AgentSafe hosted gateway · Decionis",SessionController.authority("https://swarm.decionisedge.com","decionis"));
    }
}
