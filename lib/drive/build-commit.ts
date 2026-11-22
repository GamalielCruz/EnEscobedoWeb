/**
 * Hash del build que se está sirviendo (Fase 5-D).
 *
 * `scripts/build-with-commit.mjs` REESCRIBE este archivo con el hash real
 * antes de `next build` y lo restaura al terminar. Así el valor llega al
 * cliente como LITERAL.
 *
 * Por qué no basta `process.env.NEXT_PUBLIC_BUILD_COMMIT`: en este build
 * webpack resuelve `process` al shim `process/browser` (con `env` vacío), de
 * modo que `process.env.NEXT_PUBLIC_*` NO se inlinea en el bundle del cliente
 * y la traza exportada seguía diciendo `build.commit: "unknown"` (T7).
 *
 * En desarrollo, tests y arneses de Node vale "dev".
 */
export const BUILD_COMMIT = "dev";
