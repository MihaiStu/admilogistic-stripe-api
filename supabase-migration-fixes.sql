-- ============================================================
-- FIXES OBLIGATORIOS - Ejecutar DESPUÉS de supabase-migration.sql
-- ============================================================

-- 1. UNIQUE en stripe_customer_id (evita duplicados en webhooks)
ALTER TABLE subscriptions
ADD CONSTRAINT uq_subscriptions_stripe_customer_id UNIQUE (stripe_customer_id);

-- 2. Columna stripe_price_id (frontend necesita saber el precio activo)
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

-- 3. Columna cancel_at_period_end (usuario canceló pero sigue con acceso)
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;

-- 4. CHECK constraint en status (evita valores basura)
ALTER TABLE subscriptions
ADD CONSTRAINT chk_subscriptions_status
CHECK (status IN ('active', 'past_due', 'canceling', 'canceled', 'inactive'));

-- 5. Eliminar índice redundante (user_id UNIQUE ya crea índice)
DROP INDEX IF EXISTS idx_subscriptions_user;

-- ============================================================
-- MEJORAS RECOMENDADAS (opcionales pero útiles)
-- ============================================================

-- 6. Trigger updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 7. Función RPC mejorada (devuelve defaults si no hay suscripción)
CREATE OR REPLACE FUNCTION public.get_my_subscription()
RETURNS JSON AS $$
  SELECT COALESCE(
    (SELECT row_to_json(s) FROM subscriptions s WHERE s.user_id = auth.uid() LIMIT 1),
    '{"plan":"free","status":"inactive","access_admi":false,"access_roadmaster":false,"access_tacho":false,"cancel_at_period_end":false}'::json
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
