package com.swarmpay.integrations;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

public final class RuntimeSettings {
    private RuntimeSettings() {}
    public static String required(String name) {
        String value=System.getenv(name);
        if (value==null || value.isBlank()) throw new IllegalStateException(name+" is required");
        return value;
    }
    public static String value(String name,String fallback) { String v=System.getenv(name); return v==null||v.isBlank()?fallback:v; }
    public static String mode() {
        String mode=required("SWARM_MODE");
        if (!mode.equals("demo") && !mode.equals("sandbox")) throw new IllegalStateException("SWARM_MODE must be demo or sandbox");
        return mode;
    }
    public static String secret(String name) {
        String file=System.getenv(name+"_FILE");
        if (file==null || file.isBlank()) return required(name);
        try { String value=Files.readString(Path.of(file)).strip(); if(value.isEmpty()) throw new IllegalStateException(name+" file is empty"); return value; }
        catch (java.io.IOException e) { throw new IllegalStateException("Cannot read "+name+"_FILE"); }
    }
    /** A secret that may be absent: null when neither the variable nor its _FILE is set. */
    public static String optionalSecret(String name) {
        String direct=System.getenv(name), file=System.getenv(name+"_FILE");
        if ((direct==null || direct.isBlank()) && (file==null || file.isBlank())) return null;
        return secret(name);
    }
    public static Map<String,PayPalPaymentProvider.MerchantAccount> merchants() {
        return Map.of("tents",merchant("TENTS"),"catering",merchant("CATERING"));
    }
    private static PayPalPaymentProvider.MerchantAccount merchant(String key) {
        String p="PAYPAL_"+key+"_";
        return new PayPalPaymentProvider.MerchantAccount(required(p+"CLIENT_ID"),secret(p+"CLIENT_SECRET"),required(p+"MERCHANT_ID"),required(p+"WEBHOOK_ID"));
    }
}
