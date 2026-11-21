-- Assinaturas privadas de Web Push registradas voluntariamente por administradores master.
-- Não armazena dados de clientes nem altera reservas existentes.
CREATE TABLE IF NOT EXISTS public.admin_push_subscriptions (
  endpoint text PRIMARY KEY CHECK (length(endpoint) BETWEEN 1 AND 2048),
  admin_id text NOT NULL,
  p256dh text NOT NULL CHECK (length(p256dh) BETWEEN 1 AND 256),
  auth text NOT NULL CHECK (length(auth) BETWEEN 1 AND 256),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_push_subscriptions_admin_idx
  ON public.admin_push_subscriptions (admin_id);

REVOKE ALL ON TABLE public.admin_push_subscriptions FROM PUBLIC;