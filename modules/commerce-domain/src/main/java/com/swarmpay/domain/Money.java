package com.swarmpay.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

public record Money(long minor, String currency) {
    public Money {
        if (minor < 0 || minor > 100_000_000L) throw new IllegalArgumentException("Amount is outside the supported range");
        if (!Objects.equals(currency, "USD")) throw new IllegalArgumentException("This demo supports USD only");
    }
    public static Money usd(long minor) { return new Money(minor, "USD"); }
    public static Money fromDecimal(String decimal) {
        return usd(new BigDecimal(decimal).setScale(2, RoundingMode.UNNECESSARY).movePointRight(2).longValueExact());
    }
    public Money plus(Money other) {
        if (!currency.equals(other.currency)) throw new IllegalArgumentException("Currency mismatch");
        return new Money(Math.addExact(minor, other.minor), currency);
    }
    public Money times(int quantity) {
        if (quantity < 1 || quantity > 1000) throw new IllegalArgumentException("Invalid quantity");
        return new Money(Math.multiplyExact(minor, quantity), currency);
    }
    public String decimal() { return BigDecimal.valueOf(minor, 2).toPlainString(); }
}
