-- Add covering indexes for the 6 highest-priority unindexed foreign keys.
-- Pure read structure — no semantic change, no data modification.
-- Resolves sequential scans on sale_items, purchase_items, table_orders,
-- and journal_entries reversal lookups.

-- HIGH: sale_items joined to sales on every finalize + report
CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx
  ON public.sale_items (sale_id);

-- HIGH: sale_items aggregated by material in reports + inventory deduction
CREATE INDEX IF NOT EXISTS sale_items_material_id_idx
  ON public.sale_items (material_id);

-- MEDIUM: purchase_items joined to purchases on purchase detail view
CREATE INDEX IF NOT EXISTS purchase_items_purchase_id_idx
  ON public.purchase_items (purchase_id);

-- MEDIUM: purchase_items aggregated by material in purchase reports
CREATE INDEX IF NOT EXISTS purchase_items_material_id_idx
  ON public.purchase_items (material_id);

-- MEDIUM: table_orders queried by table_id during live POS service
CREATE INDEX IF NOT EXISTS table_orders_table_id_idx
  ON public.table_orders (table_id);

-- MEDIUM: journal_entries reversal lookup — partial, only where populated
CREATE INDEX IF NOT EXISTS journal_entries_reversal_of_id_idx
  ON public.journal_entries (reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;
