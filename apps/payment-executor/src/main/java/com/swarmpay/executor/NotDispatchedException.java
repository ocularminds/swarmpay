package com.swarmpay.executor;

/**
 * PayPal could not be reached before any payment effect. The answer is a 4xx so the gateway
 * records a definite non-execution, and the application offers a retry under the same identity.
 */
final class NotDispatchedException extends RuntimeException {
    static final String MESSAGE="PayPal could not be reached before any payment was sent, and no payment was taken. Retry through authority; it reuses the same payment identity.";
    NotDispatchedException() { super(MESSAGE); }
}
