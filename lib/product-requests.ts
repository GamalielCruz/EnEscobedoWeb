export const COMMON_ALLERGIES = [
  "Polen de abeja",
  "Apio",
  "Cereales con gluten",
  "Crustáceos",
  "Huevos",
  "Pescado",
  "Leche",
  "Moluscos",
  "Mostaza",
  "Cacahuates",
  "Jalea real",
  "Sésamo",
  "Soya",
  "Dióxidos/sulfitos de azufre",
  "Nueces",
] as const;

export function normalizeProductRequests(
  input: { notes?: unknown; allergies?: unknown },
  product: { allowSpecialInstructions?: boolean; acceptsAllergyRequests?: boolean }
) {
  const notes =
    product.allowSpecialInstructions !== false
      ? String(input.notes || "").trim().slice(0, 300) || undefined
      : undefined;
  const allergies =
    product.acceptsAllergyRequests === true && Array.isArray(input.allergies)
      ? [...new Set(input.allergies.map((value) => String(value).trim().slice(0, 60)).filter(Boolean))].slice(0, 10)
      : [];

  return { notes, allergies };
}
