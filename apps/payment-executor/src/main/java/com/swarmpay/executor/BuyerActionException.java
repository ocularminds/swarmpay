package com.swarmpay.executor;

/**
 * PayPal declined the buyer's funding source and took no payment. The buyer can approve
 * the same order again with another one; that approval retries under the same command.
 */
final class BuyerActionException extends RuntimeException {
    static final String MESSAGE="PayPal declined the chosen funding source, and no payment was taken. Approve the same checkout again with another way to pay.";
    BuyerActionException() { super(MESSAGE); }
}
