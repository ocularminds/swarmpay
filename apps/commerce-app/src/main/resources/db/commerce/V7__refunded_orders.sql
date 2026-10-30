-- A refunded capture is the one state that follows a settled one.
ALTER TABLE orders DROP CONSTRAINT orders_projection_rank_check;
ALTER TABLE orders ADD CONSTRAINT orders_projection_rank_check CHECK(projection_rank BETWEEN 0 AND 6);
