-- After PayPal declines the buyer's funding source, each new buyer approval of the
-- same order is a distinct provider request for the same command.
ALTER TABLE attempts ADD COLUMN buyer_attempts integer NOT NULL DEFAULT 0
    CHECK(buyer_attempts BETWEEN 0 AND 5);
