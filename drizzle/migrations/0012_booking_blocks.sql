-- Grade comercial solicitada: quatro blocos, sem alterar reservas existentes.
-- 18:00–19:00 (1h), 19:00–21:00 (2h), 21:00–23:00 (2h), 23:00–24:00 (1h).
UPDATE public.arena_weekly_hours
SET windows = jsonb_build_array(
  jsonb_build_object('start', '18:00', 'end', '19:00', 'slotMinutes', 60),
  jsonb_build_object('start', '19:00', 'end', '21:00', 'slotMinutes', 120),
  jsonb_build_object('start', '21:00', 'end', '23:00', 'slotMinutes', 120),
  jsonb_build_object('start', '23:00', 'end', '24:00', 'slotMinutes', 60)
)
WHERE unit_id IN ('unidade-1', 'unidade-2')
  AND weekday BETWEEN 0 AND 6;
