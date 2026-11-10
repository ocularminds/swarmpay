package com.swarmpay.agents;

import com.swarmpay.domain.Commerce.*;
import com.swarmpay.domain.Money;
import java.util.List;
import java.util.regex.Pattern;

public final class DemoInterpreter implements IntentInterpreter {
    public IntentSuggestion interpret(String request, String timezone) {
        if (request == null || request.length()>4000) throw new IllegalArgumentException("Invalid request");
        var budget=Pattern.compile("\\$([\\d,]+(?:\\.\\d{1,2})?)").matcher(request);
        // A venue is named after "at", in capitals: "at Riverside Pavilion", not "at 6pm" or "at a park".
        var venue=Pattern.compile("\\bat\\s+((?:the\\s+)?\\p{Lu}[\\p{L}\\d'’&-]*(?:\\s+\\p{Lu}[\\p{L}\\d'’&-]*){0,5})").matcher(request);
        return new IntentSuggestion(number(request,"(\\d{1,3})\\s*(?:people|guests|attendees)"),
            number(request,"\\b(\\d{1,2})\\s+(?:(?:commercial|rental|weatherproof|canopy|pop-up)\\s+){0,3}tents\\b"),
            budget.find()?Money.fromDecimal(budget.group(1).replace(",","")).minor():null,
            venue.find()?venue.group(1):null,request.toLowerCase().contains("rain")?"Rain expected":null,null,
            List.of("Confirm the event's absolute date, time and venue.","Choose whether to rent or buy the tents; purchase listings require Channel3."),"DEMO_RULES");
    }
    private Integer number(String input,String expression) {
        var matcher=Pattern.compile(expression,Pattern.CASE_INSENSITIVE).matcher(input);
        return matcher.find()?Integer.valueOf(matcher.group(1)):null;
    }
}
