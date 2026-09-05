/**
 * Capa de presentación de instrucciones de navegación (español).
 *
 * El navegador pide las instrucciones a DirectionsService en el idioma del
 * loader de Maps, así que pueden llegar en inglés según el dispositivo. Esta
 * capa garantiza que NINGÚN texto crudo (inglés o HTML) llegue a la UI:
 * traduce los patrones de instrucciones típicos y, como respaldo, construye
 * la frase en español a partir del `maneuver` de Google.
 *
 * Es pura y client-safe (sin DOM).
 */

export type NavManeuver = string | null | undefined;

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

function cleanHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-zA-Z#0-9]+;/g, (entity) => HTML_ENTITIES[entity] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Frases cortas por maneuver (respaldo cuando el texto no se tradujo). */
const MANEUVER_ES: Record<string, string> = {
  depart: "Comienza tu viaje",
  straight: "Continúa recto",
  "turn-slight-left": "Gira ligeramente a la izquierda",
  "turn-slight-right": "Gira ligeramente a la derecha",
  "turn-left": "Gira a la izquierda",
  "turn-right": "Gira a la derecha",
  "turn-sharp-left": "Gira bruscamente a la izquierda",
  "turn-sharp-right": "Gira bruscamente a la derecha",
  uturn: "Da vuelta en U",
  "keep-left": "Mantente a la izquierda",
  "keep-right": "Mantente a la derecha",
  merge: "Incorpórate",
  "fork-left": "Toma la izquierda",
  "fork-right": "Toma la derecha",
  "ramp-left": "Toma la rampa a la izquierda",
  "ramp-right": "Toma la rampa a la derecha",
  "roundabout-left": "Entra a la glorieta",
  "roundabout-right": "Entra a la glorieta",
  "roundabout-uturn": "Entra a la glorieta y da vuelta en U",
  arrive: "Has llegado",
  unknown: "Continúa",
};

/** Extrae la calle de textos tipo "… onto Av. X / on Av. X / at Av. X". */
function extractStreet(value: string): string | null {
  const match = value.match(
    /\b(?:onto|on to|on|toward|towards|at|into)\s+([^,.]+?)\s*$/i
  );
  if (!match) return null;
  const street = cleanHtml(match[1]);
  return street || null;
}

const SPANISH_MARKERS =
  /gira|gire|giro|contin|incorp|glorieta|mantente|mante|sal de|entra a|derecha|izquierda|recto|llegad|llegar|toma la|toma el|destino|vuelta en u|sigue por|dirígete|dirigete|rumbo/i;

type PrefixRule = { pattern: RegExp; replace: string };

const EN_RULES: PrefixRule[] = [
  { pattern: /^head\s+(?:north|northeast|east|southeast|south|southwest|west|northwest)\s+on\s+(.+)$/i, replace: "Continúa por $1" },
  { pattern: /^head\s+(?:north|northeast|east|southeast|south|southwest|west|northwest)\s+toward\s+(.+)$/i, replace: "Continúa hacia $1" },
  { pattern: /^turn\s+slight\s+left\s+onto\s+(.+)$/i, replace: "Gira ligeramente a la izquierda en $1" },
  { pattern: /^turn\s+slight\s+right\s+onto\s+(.+)$/i, replace: "Gira ligeramente a la derecha en $1" },
  { pattern: /^turn\s+left\s+onto\s+(.+)$/i, replace: "Gira a la izquierda en $1" },
  { pattern: /^turn\s+right\s+onto\s+(.+)$/i, replace: "Gira a la derecha en $1" },
  { pattern: /^turn\s+left\s+(?:at\s+)?(.+)$/i, replace: "Gira a la izquierda en $1" },
  { pattern: /^turn\s+right\s+(?:at\s+)?(.+)$/i, replace: "Gira a la derecha en $1" },
  { pattern: /^make\s+a\s+u-?turn\s*(?:onto\s+(.+))?$/i, replace: "Da vuelta en U" },
  { pattern: /^slight\s+left\s+(?:onto\s+)?(.+)$/i, replace: "Gira ligeramente a la izquierda en $1" },
  { pattern: /^slight\s+right\s+(?:onto\s+)?(.+)$/i, replace: "Gira ligeramente a la derecha en $1" },
  { pattern: /^continue\s+straight\s+(?:to\s+stay\s+on\s+|on\s+)?(.+)$/i, replace: "Continúa recto por $1" },
  { pattern: /^continue\s+(?:straight\s+)?(?:onto\s+|on\s+)?(.+)$/i, replace: "Continúa por $1" },
  { pattern: /^keep\s+left\s+(?:to\s+stay\s+on\s+)?(.+)$/i, replace: "Mantente a la izquierda por $1" },
  { pattern: /^keep\s+right\s+(?:to\s+stay\s+on\s+)?(.+)$/i, replace: "Mantente a la derecha por $1" },
  { pattern: /^merge\s+onto\s+(.+)$/i, replace: "Incorpórate a $1" },
  { pattern: /^take\s+(?:the\s+)?(?:exit|ramp)\s+(.+?)(?:\s+toward|\s+onto|\.|$)/i, replace: "Toma la salida $1" },
  { pattern: /^at\s+the\s+roundabout,\s+take\s+the\s+(?:\d+)(?:st|nd|rd|th)\s+exit\s+onto\s+(.+)$/i, replace: "En la glorieta, toma la salida hacia $1" },
  { pattern: /^at\s+the\s+roundabout,\s+take\s+the\s+(?:\d+)(?:st|nd|rd|th)\s+exit$/i, replace: "En la glorieta, toma la salida indicada" },
  { pattern: /^enter(?:ing)?\s+the\s+roundabout/i, replace: "Entra a la glorieta" },
  { pattern: /^exit(?:ing)?\s+the\s+roundabout\s+onto\s+(.+)$/i, replace: "Sal de la glorieta hacia $1" },
  { pattern: /^exit(?:ing)?\s+the\s+roundabout/i, replace: "Sal de la glorieta" },
  { pattern: /^arrive\s+at\s+your\s+destination/i, replace: "Has llegado a tu destino" },
  { pattern: /^arrive\s+at\s+(.+)$/i, replace: "Has llegado a $1" },
  { pattern: /^destination\s+will\s+be\s+on\s+the\s+left/i, replace: "El destino estará a la izquierda" },
  { pattern: /^destination\s+will\s+be\s+on\s+the\s+right/i, replace: "El destino estará a la derecha" },
  { pattern: /^destination\s+on\s+the\s+left/i, replace: "Destino a la izquierda" },
  { pattern: /^destination\s+on\s+the\s+right/i, replace: "Destino a la derecha" },
];

function looksEnglish(value: string): boolean {
  return /^[a-z\s,.'’()-]+$/i.test(value) && !SPANISH_MARKERS.test(value);
}

/** Frase en español a partir del maneuver + calle si el texto no aplicó. */
function phraseFromManeuver(maneuver: string, street: string | null): string {
  const base = MANEUVER_ES[maneuver] ?? MANEUVER_ES.unknown;
  if (street) return `${base} en ${street}`;
  return base;
}

/**
 * Normaliza una instrucción de Directions a español para la UI.
 * - Limpia cualquier resto de HTML.
 * - Traduce patrones típicos en inglés.
 * - Si no se tradujo y parece inglés, usa el maneuver como respaldo.
 */
export function instructionInSpanish(instruction: string, maneuver?: NavManeuver): string {
  const cleaned = cleanHtml(instruction ?? "");
  if (!cleaned) return phraseFromManeuver(maneuver ?? "unknown", null);

  // Ya en español o sin marcas de inglés → devolver limpio tal cual.
  if (!looksEnglish(cleaned)) return cleaned;

  for (const rule of EN_RULES) {
    const match = cleaned.match(rule.pattern);
    if (match) {
      return cleanHtml(rule.replace.replace(/\$1/g, match[1] ?? ""));
    }
  }

  // Respaldos por maneuver cuando el patrón no matcheó.
  if (maneuver && MANEUVER_ES[maneuver]) {
    return phraseFromManeuver(maneuver, extractStreet(cleaned));
  }

  // Último respaldo: frases sueltas muy comunes.
  const lower = cleaned.toLowerCase();
  if (lower.startsWith("turn left")) return "Gira a la izquierda";
  if (lower.startsWith("turn right")) return "Gira a la derecha";
  if (lower.startsWith("slight left")) return "Gira ligeramente a la izquierda";
  if (lower.startsWith("slight right")) return "Gira ligeramente a la derecha";
  if (lower.startsWith("keep left")) return "Mantente a la izquierda";
  if (lower.startsWith("keep right")) return "Mantente a la derecha";
  if (lower.includes("u-turn") || lower.includes("u turn")) return "Da vuelta en U";

  return cleaned;
}
