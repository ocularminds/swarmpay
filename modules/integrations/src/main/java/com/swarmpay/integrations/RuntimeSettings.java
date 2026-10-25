package com.swarmpay.integrations;

import java.nio.file.Files;
import java.nio.file.Path;

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
}
