-- IMPRESORA-01 DEV: disposable receipt copy, never economic evidence.
-- One read-only receipt per confirmed sale; keep economic records unchanged.
CREATE TABLE public.sale_print_tickets (
  sale_id uuid PRIMARY KEY REFERENCES public.sales(id) ON DELETE CASCADE,
  confirmed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  ticket_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_print_tickets_payload_check
    CHECK (jsonb_typeof(ticket_json) = 'object'),
  CONSTRAINT sale_print_tickets_expiry_check
    CHECK (expires_at = confirmed_at + interval '15 days')
);
CREATE INDEX sale_print_tickets_expires_at_idx ON public.sale_print_tickets(expires_at);
ALTER TABLE public.sale_print_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sale_print_tickets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.sale_print_tickets TO service_role;
COMMENT ON TABLE public.sale_print_tickets IS
  'IMPRESORA-01: disposable print-only copy. The sale, ledger, audit and economic idempotency remain untouched.';

-- DEV daily cleanup at 04:10 UTC; expiration is independently enforced on every read.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule(
  'impresora01_purge_sale_print_tickets',
  '10 4 * * *',
  $job$DELETE FROM public.sale_print_tickets WHERE expires_at <= now()$job$
);
