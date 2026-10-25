package com.swarmpay.domain;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class MoneyTest {
    @Test void decimalArithmeticDoesNotLoseCents() {
        assertEquals(30, Money.fromDecimal("0.10").times(3).minor());
        assertEquals("1400.00", Money.usd(50000).plus(Money.usd(90000)).decimal());
    }
    @Test void rejectsFractionalCentsNegativeAmountsAndCurrencyChanges() {
        assertThrows(ArithmeticException.class, () -> Money.fromDecimal("1.001"));
        assertThrows(IllegalArgumentException.class, () -> Money.usd(-1));
        assertThrows(IllegalArgumentException.class, () -> new Money(100, "EUR"));
        assertThrows(IllegalArgumentException.class, () -> Money.usd(100).times(-1));
    }
}
