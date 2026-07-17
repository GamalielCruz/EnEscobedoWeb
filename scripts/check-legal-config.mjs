const required = ["LEGAL_RESPONSIBLE_NAME", "LEGAL_RFC", "LEGAL_PHONE", "LEGAL_ADDRESS", "DELIVERY_PIN_SECRET", "LEGAL_AUDIT_SECRET"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Bloqueadores legales/operativos pendientes: ${missing.join(", ")}`);
  process.exitCode = 1;
} else console.log("Configuración legal mínima completa.");
