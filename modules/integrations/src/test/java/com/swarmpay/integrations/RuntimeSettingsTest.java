package com.swarmpay.integrations;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class RuntimeSettingsTest {
    @Test void theAuthorityIsChosenApartFromThePaymentMode() {
        assertEquals("local",RuntimeSettings.authority("demo",null));
        assertEquals("decionis",RuntimeSettings.authority("sandbox"," "));
        // PayPal sandbox can run under the disclosed local test authority.
        assertEquals("local",RuntimeSettings.authority("sandbox","local"));
        assertEquals("decionis",RuntimeSettings.authority("sandbox","decionis"));
    }
    @Test void simulatedPaymentsNeverClaimHostedAuthority() {
        assertThrows(IllegalStateException.class,()->RuntimeSettings.authority("demo","decionis"));
        assertThrows(IllegalStateException.class,()->RuntimeSettings.authority("sandbox","shadow"));
    }
}
