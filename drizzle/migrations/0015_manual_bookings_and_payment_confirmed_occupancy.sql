-- Reservas manuais Master ocupam a agenda sem fabricar pagamento; checkouts públicos
-- pendentes permanecem sem retenção e não participam da exclusão por sobreposição.
BEGIN;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS is_admin_manual boolean NOT NULL DEFAULT false;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_payment_method_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_method_check
  CHECK (payment_method IN ('pix', 'card_onsite', 'cash_onsite', 'admin_manual'));

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_no_overlap;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (space_id WITH =, slot WITH &&)
  WHERE (
    payment_status = 'paid'
    OR (is_admin_manual = true AND payment_status = 'pending')
  );

-- Atualiza apenas valores da tarifa antiga de R$50/h; valores customizados não mudam.
-- A conversão é proporcional à duração configurada, mantendo o valor por hora em R$60.
UPDATE public.arena_spaces
SET price_cents = round(6000::numeric * slot_minutes / 60)::integer
WHERE unit_id IN ('unidade-1', 'unidade-2')
  AND price_cents = round(5000::numeric * slot_minutes / 60)::integer;

-- Grade padrão de ambas as unidades. Exceções explicitamente salvas em
-- arena_date_overrides permanecem intactas.
UPDATE public.arena_weekly_hours
SET windows = CASE
      WHEN weekday IN (0, 6) THEN jsonb_build_array(
        jsonb_build_object('start', '15:00', 'end', '23:00')
      )
      ELSE jsonb_build_array(
        jsonb_build_object('start', '19:00', 'end', '23:00')
      )
    END,
    updated_at = now()
WHERE unit_id IN ('unidade-1', 'unidade-2')
  AND weekday BETWEEN 0 AND 6;

COMMIT;
