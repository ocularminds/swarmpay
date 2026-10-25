package com.swarmpay.agents;

import com.swarmpay.domain.Commerce.*;
import com.swarmpay.domain.Money;
import java.util.List;
import java.util.regex.Pattern;

public final class DemoInterpreter implements IntentInterpreter {
    public IntentSuggestion interpret(String request, String timezone) {
        if (request == null || request.length()>4000) throw new IllegalArgumentException("Invalid request");
        var budget=Pattern.compile("\\$([\\d,]+(?:\\.\\d{1,2})?)").matcher(request);
        return new IntentSuggestion(number(request,"(\\d{1,3})\\s*(?:people|guests|attendees)"),
            number(request,"(\\d{1,2})\\s*(?:commercial\\s+)?(?:pop-up\\s+)?tents"),
            budget.find()?Money.fromDecimal(budget.group(1).replace(",","")).minor():null,
            null,request.toLowerCase().contains("rain")?"Rain expected":null,null,
            List.of("Confirm the event's absolute date, time and venue.","This catalog rents tents; confirm that rentals fit your request."),"DEMO_RULES");
    }
    private Integer number(String input,String expression) {
        var matcher=Pattern.compile(expression,Pattern.CASE_INSENSITIVE).matcher(input);
        return matcher.find()?Integer.valueOf(matcher.group(1)):null;
    }
}
