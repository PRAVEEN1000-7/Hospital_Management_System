-- Bug #50: a supplier can legitimately re-use the same batch number across
-- shipments that carry different manufacturing/expiry dates. The previous
-- uniqueness rule (medicine/product + batch_number only) treated these as
-- "the same batch" — a second GRN with a matching batch number but different
-- dates silently merged into the first batch's row (losing the newly
-- shipped batch's real expiry date), and the manual "Add Batch" form instead
-- rejected it outright as a duplicate. Widening the uniqueness key to include
-- both dates lets each physically distinct batch be tracked as its own row.
--
-- Written only — do not execute automatically; apply manually after review.

ALTER TABLE medicine_batches DROP CONSTRAINT IF EXISTS uq_medicine_batch;
ALTER TABLE medicine_batches ADD CONSTRAINT uq_medicine_batch
  UNIQUE (medicine_id, batch_number, manufactured_date, expiry_date);

ALTER TABLE optical_batches DROP CONSTRAINT IF EXISTS uq_optical_batch;
ALTER TABLE optical_batches ADD CONSTRAINT uq_optical_batch
  UNIQUE (optical_product_id, batch_number, manufactured_date, expiry_date);
