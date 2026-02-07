-- ============================================================
-- Migración: Tabla de suscripciones centralizada
-- Ejecutar en el proyecto Supabase central (TMS)
-- ============================================================

-- Tabla de suscripciones (una fila por usuario)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Stripe
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,

  -- Plan y estado
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'inactive',
  -- status: 'active' | 'past_due' | 'canceling' | 'canceled' | 'inactive'

  -- Accesos por app (resueltos desde metadata del precio)
  access_admi BOOLEAN NOT NULL DEFAULT false,
  access_roadmaster BOOLEAN NOT NULL DEFAULT false,
  access_tacho BOOLEAN NOT NULL DEFAULT false,

  -- Periodo actual de la suscripción
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para búsquedas rápidas desde webhooks
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer
  ON subscriptions(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub
  ON subscriptions(stripe_subscription_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user
  ON subscriptions(user_id);

-- RLS: los usuarios solo pueden leer su propia suscripción
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscription"
  ON subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- El service_role (usado por el backend) bypassa RLS automáticamente.
-- No se necesita policy de INSERT/UPDATE para el backend.

-- ============================================================
-- Función para que los frontends consulten accesos fácilmente
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_subscription()
RETURNS JSON AS $$
  SELECT row_to_json(s)
  FROM subscriptions s
  WHERE s.user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
