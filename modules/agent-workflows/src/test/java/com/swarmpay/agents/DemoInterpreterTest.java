package com.swarmpay.agents;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class DemoInterpreterTest {
    final DemoInterpreter interpreter=new DemoInterpreter();

    @Test void readsTheExampleIncludingItsVenue() {
        var read=interpreter.interpret("I'm hosting an outdoor tech meetup for 30 people at Riverside Pavilion. Rain is forecast. Find catering and 5 pop-up tents within a total budget of $1,500.","UTC");
        assertEquals(30,read.attendees());assertEquals(5,read.tents());assertEquals(150000L,read.budgetMinor());
        assertEquals("Riverside Pavilion",read.venue());assertEquals("Rain expected",read.weather());
    }
    @Test void leavesWhatTheDescriptionDoesNotSayEmpty() {
        var read=interpreter.interpret("A garden party for 40 guests at 6pm in a park. We need 6 tents and catering, $2,000 in total.","UTC");
        assertEquals(40,read.attendees());assertEquals(6,read.tents());
        assertNull(read.venue());assertNull(read.weather());assertNull(read.eventDate());
    }
}
