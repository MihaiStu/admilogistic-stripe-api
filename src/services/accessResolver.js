/**
 * Resuelve los accesos del usuario a partir de los metadata del precio Stripe.
 *
 * Cada precio en Stripe DEBE tener los siguientes metadata:
 *   - plan:  nombre del plan (ej: "admi", "roadmaster", "suite_operativa")
 *   - apps:  lista de apps separadas por coma (ej: "admi,roadmaster")
 *
 * Ejemplo de retorno:
 *   { plan: "suite_operativa", admi: true, roadmaster: true, tacho: false }
 */

const ALL_APPS = ['admi', 'roadmaster', 'tacho'];

/**
 * @param {object} price - Objeto price de Stripe (con .metadata)
 * @returns {{ plan: string, admi: boolean, roadmaster: boolean, tacho: boolean }}
 */
function resolveAccessFromPrice(price) {
  const metadata = price?.metadata || {};
  const plan = metadata.plan || 'free';
  const appsString = metadata.apps || '';

  // Parsear lista de apps desde metadata
  const grantedApps = appsString
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);

  // Construir objeto de accesos
  const access = { plan };
  for (const app of ALL_APPS) {
    access[app] = grantedApps.includes(app);
  }

  return access;
}

/**
 * Retorna accesos revocados (todo false, plan free).
 * Se usa al cancelar suscripción o fallo de pago.
 */
function revokeAllAccess() {
  const access = { plan: 'free' };
  for (const app of ALL_APPS) {
    access[app] = false;
  }
  return access;
}

module.exports = { resolveAccessFromPrice, revokeAllAccess, ALL_APPS };
