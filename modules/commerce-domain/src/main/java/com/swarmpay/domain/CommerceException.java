package com.swarmpay.domain;

public class CommerceException extends RuntimeException {
    private final String code;
    private final int status;
    public CommerceException(String code, String message, int status) {
        super(message);
        this.code = code;
        this.status = status;
    }
    public String code() { return code; }
    public int status() { return status; }
    public static CommerceException invalid(String message) { return new CommerceException("INVALID_REQUEST", message, 400); }
    public static CommerceException conflict(String message) { return new CommerceException("STATE_CONFLICT", message, 409); }
    public static CommerceException held(String message) { return new CommerceException("HELD", message, 409); }
}
