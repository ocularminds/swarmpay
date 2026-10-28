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
    /** Who decides payments, chosen apart from the payment mode: PayPal sandbox may run under the local test authority. */
    public static String authority(String mode) { return authority(mode,System.getenv("SWARM_AUTHORITY")); }
    static String authority(String mode,String configured) {
        String authority=configured==null||configured.isBlank()?(mode.equals("demo")?"local":"decionis"):configured.strip();
        if (!authority.equals("local") && !authority.equals("decionis")) throw new IllegalStateException("SWARM_AUTHORITY must be local or decionis");
        if (mode.equals("demo") && !authority.equals("local")) throw new IllegalStateException("Simulated payments use the local test authority");
        return authority;
    }
    public static String secret(String name) {
        String file=System.getenv(name+"_FILE");
        if (file==null || file.isBlank()) return required(name);
        try { String value=Files.readString(Path.of(file)).strip(); if(value.isEmpty()) throw new IllegalStateException(name+" file is empty"); return value; }
        catch (java.io.IOException e) { throw new IllegalStateException("Cannot read "+name+"_FILE"); }
    }
    /** A service's URL, or {@code http://} and the host:port a platform gives it (Render's private hostnames carry a suffix). */
    public static String serviceUrl(String urlName,String hostportName) {
        String url=System.getenv(urlName);
        if (url!=null && !url.isBlank()) return url.strip();
        String hostport=System.getenv(hostportName);
        if (hostport==null || hostport.isBlank() || !hostport.strip().matches("[A-Za-z0-9.-]+:\\d{1,5}")) throw new IllegalStateException(urlName+" or "+hostportName+" is required");
        return "http://"+hostport.strip();
    }
    /** The admitted venue public key: a mounted PEM file, or the PEM itself where a platform can't mount files. */
    public static String venuePublicKey() throws java.io.IOException {
        String file=System.getenv("VENUE_PUBLIC_KEY_FILE");
        if (file!=null && !file.isBlank()) return Files.readString(Path.of(file));
        return required("VENUE_PUBLIC_KEY").replace("\\n","\n");
    }
    /** Route outbound HTTPS through the egress proxy when its host:port is configured rather than set in JAVA_TOOL_OPTIONS. */
    public static void egressProxy() {
        String hostport=System.getenv("EGRESS_HOSTPORT");
        if (hostport==null || hostport.isBlank()) return;
        var parts=hostport.strip().split(":");
        if (parts.length!=2 || !parts[1].matches("\\d{1,5}")) throw new IllegalStateException("EGRESS_HOSTPORT must be host:port");
        System.setProperty("https.proxyHost",parts[0]);System.setProperty("https.proxyPort",parts[1]);
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
