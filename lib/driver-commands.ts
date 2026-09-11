// Comandos operativos del repartidor por WhatsApp.
//
// Los repartidores escriben los comandos a mano en el chat y llegan variaciones
// menores (espacios dobles, puntuación final, "a" en lugar de "al", etc.). Un
// comando operativo válido NUNCA debe caer en la conversación de soporte por un
// matcheo estricto de texto: aquí se normaliza el comando y se toleran variantes
// conocidas antes de decidir si corresponde a un handler operativo.

// Variantes conocidas escritas por repartidores en producción (clave: comando
// canónico; valor: variantes que deben tratarse igual).
export const COMMAND_VARIANTS: Record<string, string[]> = {
  // Caso real de producción (order 8c6f3ef4): el repartidor escribió
  // "Pedido en dirección A domicilio" y el matcheo estricto lo mandó a soporte.
  'PEDIDO EN DIRECCION AL DOMICILIO': ['PEDIDO EN DIRECCION A DOMICILIO'],
}

// Colapsa espacios repetidos y quita puntuación de fin de frase
// (".", ",", "!", "?", ";", ":") para que "En puerta." o "En  puerta" sean
// equivalentes a "EN PUERTA". NO toca el interior del texto, por lo que los
// folios (UUID con guiones, "#folio") quedan intactos.
export function canonicalizeCommandText(text: string): string {
  return String(text ?? '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,!?;:]+$/g, '')
    .trim()
}

// Compara un mensaje contra un comando canónico tolerando variantes y devuelve:
//   - null       → el mensaje NO es este comando (ni variante, ni con folio)
//   - ''         → es el comando exacto (sin folio)
//   - 'FOLIO'    → es el comando seguido de un folio (p. ej. "EN PUERTA #abc-1")
// El texto se compara normalizado (espacios colapsados, sin puntuación final,
// mayúsculas) y el folio se devuelve sin el "#" inicial.
export function matchDriverCommand(textBody: string, command: string): string | null {
  const canonical = canonicalizeCommandText(textBody)
  const candidates = [command, ...(COMMAND_VARIANTS[command] ?? [])]

  for (const candidate of candidates) {
    if (canonical === candidate) return ''
    if (canonical.startsWith(`${candidate} `)) {
      return canonical.slice(candidate.length).trim().replace(/^#/, '')
    }
  }

  return null
}
