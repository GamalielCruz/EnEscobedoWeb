# Task: el temporizador de la "Nueva oferta" dice "Preparando…" en Drive

> **Estado:** PENDIENTE — **no implementar todavía**. El usuario pidió
> recordarlo como task (2026-09-29): primero hay que investigar cuál es la
> mejor forma de evitarlo antes de tocar código.

## Síntoma observado (captura del 2026-09-29, staging / dataset `test`)

Cuando el repartidor se conecta y el sistema le notifica una orden, la tarjeta
"NUEVA OFERTA" muestra en su cabecera **"Preparando…"** (con spinner) en lugar
del temporizador de cuenta regresiva. El repartidor no sabe cuánto tiempo
tiene para decidir → mala experiencia justo en el momento crítico.

## Causa técnica actual (mapeo rápido, sin cambiar nada)

- `app/(drive)/drive/page.tsx` → `OfferCard`:
  `const isPending = offer.offerStatus === "pending_delivery";`
  Mientras la oferta está en `pending_delivery`, la cabecera muestra
  spinner + **"Preparando…"**; el countdown solo se pinta cuando la oferta
  está `active` (anclada a `offerExpiresAt` con corrección de reloj).
- `lib/dispatch/offer-lifecycle.ts`: desde el unificado de ofertas, **TODAS**
  nacen en `PENDING_DELIVERY` con ventana de entrega de 45 s
  (`OFFER_PENDING_WINDOW_SECONDS`); los 14 s de respuesta
  (`OFFER_ACTIVE_TTL_SECONDS`) se fijan al hacer el **ACK de presentación**
  (`decideOfferAck`, idempotente).
- Hipótesis a verificar (no confirmada): el ACK de presentación
  (`OFFER_SHOWN`) no está llegando del cliente de Drive (o llega tarde), así
  que la oferta permanece `pending_delivery` y el conductor ve "Preparando…"
  durante la ventana de entrega en vez de un temporizador útil.

## Caminos a investigar en el futuro (trade-offs por decidir)

1. **Auto-ACK al renderizar**: que Drive confirme presentación en cuanto la
   tarjeta se pinta → arranca el countdown de 14 s de inmediato. Riesgo: si
   el teléfono está con la app en background, el tiempo corre sin que el
   conductor vea la oferta.
2. **Mostrar countdown durante `pending_delivery`**: en lugar de
   "Preparando…", mostrar la ventana de entrega restante (45 s) o una barra
   neutra. Menos engañoso, pero el tiempo real de respuesta solo empieza con
   el ACK.
3. **Híbrido**: indicador neutro (sin "Preparando…") + auto-ACK al renderizar
   + degradación elegante si no hay red.

Decidir cuál respeta la regla de oro ya implementada: el deadline es un
timestamp ABSOLUTO del servidor; el cliente nunca reinicia el contador.

## Criterios de aceptación (cuando se implemente)

- La cabecera de la oferta NUNCA muestra "Preparando…" como estado final del
  temporizador visible para el conductor.
- El tiempo mostrado sigue siendo server-driven (no reiniciable por polling).
- No se rompe el ciclo PENDING → ACK → ACTIVE ni el TTL de 14 s.
- Verificado en staging con el simulador y con un pedido real.
