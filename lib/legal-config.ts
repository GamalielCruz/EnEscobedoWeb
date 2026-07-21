export const LEGAL_CONTACT_EMAIL = process.env.LEGAL_CONTACT_EMAIL || "hola@elmenu.site";
export const LEGAL_SUPPORT_EMAIL = process.env.LEGAL_SUPPORT_EMAIL || LEGAL_CONTACT_EMAIL;
export const ARCO_CONTACT_EMAIL = process.env.ARCO_CONTACT_EMAIL || LEGAL_CONTACT_EMAIL;

export const legalConfig = {
  businessName: process.env.LEGAL_BUSINESS_NAME || "ElMenu",
  responsibleName: process.env.LEGAL_RESPONSIBLE_NAME || "",
  rfc: process.env.LEGAL_RFC || "",
  phone: process.env.LEGAL_PHONE || "",
  address: process.env.LEGAL_ADDRESS || "",
  contactEmail: LEGAL_CONTACT_EMAIL,
  supportEmail: LEGAL_SUPPORT_EMAIL,
  arcoEmail: ARCO_CONTACT_EMAIL,
  effectiveDate: process.env.LEGAL_EFFECTIVE_DATE || "2026-07-15",
  version: process.env.LEGAL_VERSION || "1.0.0",
} as const;

export const legalVersions = {
  customerTerms: legalConfig.version,
  privacy: legalConfig.version,
  cancellations: legalConfig.version,
  restaurantTerms: legalConfig.version,
} as const;

export const missingLegalLaunchFields = [
  ["LEGAL_RESPONSIBLE_NAME", legalConfig.responsibleName],
  ["LEGAL_RFC", legalConfig.rfc],
  ["LEGAL_PHONE", legalConfig.phone],
  ["LEGAL_ADDRESS", legalConfig.address],
].filter(([, value]) => !value).map(([name]) => name);

export function assertCurrentLegalAcceptance(input: unknown): asserts input is true {
  if (input !== true) throw new Error("Debes aceptar los documentos legales vigentes para continuar.");
}
