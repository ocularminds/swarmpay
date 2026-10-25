package com.swarmpay.integrations;

import com.swarmpay.domain.Commerce.*;
import com.swarmpay.domain.CommerceException;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class PayPalBindingTest {
    final UUID workflow=UUID.randomUUID();
    final PaymentCommand command=new PaymentCommand(UUID.randomUUID(),workflow,1,UUID.randomUUID(),Operation.CAPTURE_ORDER,"tents",50000,"USD","PP-ORDER",null,workflow.toString(),"fixture-v1");
    com.fasterxml.jackson.databind.JsonNode order(String payee,String amount) {
        return Json.MAPPER.valueToTree(Map.of("id","PP-ORDER","purchase_units",List.of(Map.of("payee",Map.of("merchant_id",payee),"custom_id",command.orderId().toString(),"amount",Map.of("currency_code","USD","value",amount)))));
    }
    @Test void bindsProviderPayeeAndAmountBeforeMoneyMoves() {
        assertDoesNotThrow(()->PayPalPaymentProvider.verifyOrder(order("MERCHANT-1","500.00"),command,"MERCHANT-1"));
        assertThrows(CommerceException.class,()->PayPalPaymentProvider.verifyOrder(order("ATTACKER","500.00"),command,"MERCHANT-1"));
        assertThrows(CommerceException.class,()->PayPalPaymentProvider.verifyOrder(order("MERCHANT-1","500.01"),command,"MERCHANT-1"));
    }
    @Test void aPendingCaptureIsNotDisplayedAsPaid() {
        var node=order("MERCHANT-1","500.00");
        ((com.fasterxml.jackson.databind.node.ObjectNode)node.path("purchase_units").get(0)).set("payments",Json.MAPPER.valueToTree(Map.of("captures",List.of(Map.of("id","CAPTURE","status","PENDING","amount",Map.of("currency_code","USD","value","500.00"))))));
        assertEquals("PENDING",PayPalPaymentProvider.readOrder(node,command).status());
    }
    @Test void aDeclinedCaptureIsNotReportedAsPaymentOrPerpetuallyPending() {
        var node=order("MERCHANT-1","500.00");
        ((com.fasterxml.jackson.databind.node.ObjectNode)node.path("purchase_units").get(0)).set("payments",Json.MAPPER.valueToTree(Map.of("captures",List.of(Map.of("id","CAPTURE","status","DECLINED","amount",Map.of("currency_code","USD","value","500.00"))))));
        assertEquals("DECLINED",PayPalPaymentProvider.readOrder(node,command).status());
    }
}
