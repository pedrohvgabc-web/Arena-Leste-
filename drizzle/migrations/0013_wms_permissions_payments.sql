-- Permissões individuais por aba do WMS e checkout InfinitePay para vendas do PDV.
ALTER TABLE public.wms_users
  ADD COLUMN IF NOT EXISTS tab_permissions jsonb NOT NULL DEFAULT '["balcao"]'::jsonb;

ALTER TABLE public.wms_sales
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS payment_order_nsu text,
  ADD COLUMN IF NOT EXISTS payment_checkout_url text,
  ADD COLUMN IF NOT EXISTS payment_transaction_nsu text,
  ADD COLUMN IF NOT EXISTS payment_paid_at timestamptz;

ALTER TABLE public.wms_sales DROP CONSTRAINT IF EXISTS wms_sales_payment_method_check;
ALTER TABLE public.wms_sales
  ADD CONSTRAINT wms_sales_payment_method_check
  CHECK (payment_method IN ('pix', 'card', 'cash', 'pending', 'infinitepay'));

CREATE UNIQUE INDEX IF NOT EXISTS wms_sales_payment_order_nsu_idx
  ON public.wms_sales(payment_order_nsu)
  WHERE payment_order_nsu IS NOT NULL;

UPDATE public.wms_users
SET tab_permissions = '["dashboard","balcao","catalogo","estoque","auditoria","usuarios"]'::jsonb
WHERE role = 'admin_remote';
