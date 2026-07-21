import Link from "next/link";
import { legalConfig } from "@/lib/legal-config";

type LegalDocument = { title: string; summary: string; sections: Array<[string, string]> };
const contact = legalConfig.supportEmail;
const responsible = legalConfig.responsibleName || legalConfig.businessName;
const legalIdentity = legalConfig.address ? `${responsible}, con domicilio en ${legalConfig.address}` : responsible;

export const legalDocuments: Record<string, LegalDocument> = {
  "terminos-clientes": { title: "Términos para clientes", summary: "Reglas de uso y contratación con restaurantes.", sections: [
    ["Plataforma y vendedor", "ElMenu conecta clientes con restaurantes. El restaurante identificado en cada pedido es el vendedor y responde por existencia, preparación, inocuidad, calidad, ingredientes, alérgenos, permisos, precio e imágenes. ElMenu responde por su tecnología, datos, pagos, soporte y políticas."],
    ["Cuenta y pedidos", "Debes tener capacidad legal, proteger tu cuenta y proporcionar datos correctos. La V1 permite recogida y entrega propia del restaurante. Los tiempos son estimaciones; las imágenes son ilustrativas y la disponibilidad se confirma al procesar el pedido."],
    ["Precios y pagos", "Antes de confirmar se muestran subtotal, descuentos, entrega, tarifa de servicio, propina, impuestos aplicables y total. El backend recalcula los importes. Stripe procesa pagos en línea; ElMenu no almacena número completo de tarjeta ni CVV."],
    ["Entrega y PIN", "Proporciona una dirección correcta, mantente localizable y comparte el PIN solo con el pedido en tus manos. Una entrega a otra persona requiere tu autorización expresa. El PIN validado es evidencia, no elimina el derecho a reclamar."],
    ["Cancelaciones, abuso y soporte", `Cancelaciones, faltantes, pedidos incorrectos, cobros duplicados y no entrega se atienden conforme a la política publicada. Se prohíben fraude y usos ilícitos. Contacto: ${contact}. Se aplica la legislación mexicana y permanecen intactos los derechos irrenunciables del consumidor.`],
  ]},
  privacidad: { title: "Aviso de privacidad integral", summary: "Tratamiento de datos para operar ElMenu.", sections: [
    ["Aviso simplificado", `${legalIdentity}, responsable de ElMenu, trata datos para crear cuentas, procesar pedidos y pagos, validar cobertura, entregar, brindar soporte, prevenir fraude, conservar evidencia y cumplir obligaciones. Derechos ARCO: ${legalConfig.arcoEmail}.`],
    ["Datos", "Podemos tratar nombre, correo, teléfono, ID de Clerk, dirección, referencias, coordenadas, pedidos, comunicaciones, evidencia, dispositivo, IP limitada, eventos de seguridad, tokens de pago y datos fiscales. No guardamos número completo de tarjeta, CVV, contraseñas de Stripe ni credenciales bancarias completas."],
    ["Finalidades secundarias", "Promociones, recomendaciones, analítica comercial y campañas por WhatsApp o correo requieren la base legal o consentimiento aplicable. Puedes oponerte o retirar el consentimiento sin afectar el servicio esencial."],
    ["Proveedores", "Usamos por función a Clerk, Stripe, Meta/WhatsApp, Google Maps, Sanity, Vercel y Baserow. Pueden procesar información fuera de México conforme a contratos y medidas aplicables."],
    ["Derechos y conservación", `Solicita acceso, rectificación, cancelación, oposición, revocación o limitación en ${legalConfig.arcoEmail}. Conservaremos o bloquearemos datos necesarios por obligaciones fiscales, contractuales, antifraude o defensa legal.`],
  ]},
  "cancelaciones-reembolsos": { title: "Cancelaciones y reembolsos", summary: "Criterios para cancelaciones e incidencias.", sections: [
    ["Antes de preparar", "Antes de confirmar el restaurante puedes cancelar sin costo y recibir reembolso total si hubo cargo. Después de confirmar y antes de preparar se permitirá cuando sea posible; cualquier costo comprobable se mostrará primero."],
    ["En preparación o terminado", "Se revisa el avance real y no se cobran conceptos no comprobables. Un pedido terminado, recogido o entregado no admite cancelación automática, pero sí una incidencia."],
    ["Incidencias", "Cobros duplicados se reembolsan. Faltantes pueden generar reembolso proporcional; productos equivocados, reposición o reembolso. La no entrega se investiga con PIN, tiempos, ubicación necesaria y evidencia, sin decisión automática."],
    ["Devolución", `Tarjetas se devuelven al mismo medio cuando sea posible. En efectivo se registra forma y evidencia. Solicita folio en ${contact}; los tiempos bancarios son estimados.`],
  ]},
  restaurantes: { title: "Condiciones para restaurantes", summary: "Base contractual operativa para restaurantes.", sections: [
    ["Declaraciones", "El restaurante declara que puede vender lo publicado, tiene permisos, informa ingredientes y alérgenos, mantiene precios y disponibilidad correctos y no ofrece productos prohibidos."],
    ["Operación", "Responde por preparación, inocuidad, calidad, empaquetado, tiempos y su entrega propia. Debe registrar aceptación, inicio de preparación, faltantes, cancelaciones y evidencia."],
    ["Pagos", "Comisiones, IVA, liquidaciones, efectivo, Stripe, promociones, reembolsos atribuibles y contracargos se reflejan en el expediente financiero."],
    ["Datos", "Los datos del cliente se usan solo para el pedido y soporte relacionado. Se prohíben campañas o contacto ajeno sin consentimiento. Aplican confidencialidad, antifraude, suspensión y terminación."],
  ]},
  "productos-prohibidos": { title: "Productos permitidos y prohibidos", summary: "Alcance de catálogo V1.", sections: [
    ["Permitidos", "Alimentos preparados, bebidas sin alcohol, alimentos empaquetados permitidos y complementos relacionados, con información y permisos correctos."],
    ["Prohibidos", "Alcohol, tabaco, vapeadores, medicamentos, sustancias controladas, armas, explosivos, animales, mercancía robada, falsificaciones, tarjetas revendidas, dinero, contenido ilegal, productos peligrosos y artículos con permisos especiales no verificados."],
    ["Aplicación", "ElMenu puede despublicar preventivamente y pedir evidencia. Publicar no convierte a ElMenu en vendedor ni sustituye permisos sanitarios."],
  ]},
  cookies: { title: "Cookies y tecnologías similares", summary: "Almacenamiento y medición usados por la plataforma.", sections: [
    ["Necesarias", "Usamos tecnologías necesarias para sesión, Clerk, carrito, seguridad, fraude y preferencias esenciales. Deshabilitarlas puede impedir funciones básicas."],
    ["Medición", "Vercel Analytics y Speed Insights pueden generar medición técnica. Una tecnología no necesaria que requiera consentimiento permanecerá inactiva hasta tu elección."],
    ["Control", "Puedes borrar o limitar cookies desde el navegador y cambiar preferencias disponibles. No presentamos como opcional una tecnología estrictamente necesaria."],
  ]},
  entregas: { title: "Política de entregas", summary: "Responsable y confirmación segura.", sections: [
    ["Responsable", "Cada pedido identifica recogida o entrega directa del restaurante. El reparto abierto administrado por ElMenu está desactivado en la V1."],
    ["PIN", "Las entregas usan un PIN de seis dígitos. Compártelo solo tras recibir el pedido. No se envía completo al repartidor ni aparece en logs; el backend valida antes de completar."],
    ["Terceros y evidencia", "Otra persona requiere autorización expresa. No se puede dejar unilateralmente con vecinos o en la calle. La evidencia puede incluir fecha, actor, estado y ubicación aproximada necesaria; no se exige fotografiar rostros o interiores."],
  ]},
  contacto: { title: "Contacto y soporte", summary: "Canal único de atención V1.", sections: [
    ["Correo", `Contacto general, soporte y privacidad/ARCO: ${contact}.`],
    ["Solicitud", "Incluye número de pedido, tipo de incidencia y descripción breve. No envíes PIN, tarjeta completa, CVV, contraseñas ni credenciales bancarias."],
    ["Folio", "Cada solicitud operativa debe generar folio. Informaremos una estimación de primera respuesta según carga, sin garantizar resolución en un plazo fijo."],
  ]},
};

export function LegalDocumentPage({ slug }: { slug: string }) {
  const document = legalDocuments[slug];
  if (!document) return null;
  return <main className="mx-auto min-h-screen max-w-4xl px-4 py-10 text-gray-800">
    <Link href="/legal" className="text-sm font-medium text-[#eb1902] hover:underline">← Centro legal</Link>
    <h1 className="mt-6 text-3xl font-bold text-gray-950">{document.title}</h1><p className="mt-3 text-gray-600">{document.summary}</p>
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Base operativa pendiente de revisión jurídica profesional.</div>
    <p className="mt-4 text-sm text-gray-500">Versión {legalConfig.version} · Vigente desde {legalConfig.effectiveDate}</p>
    <nav aria-label="Índice" className="my-8 rounded-xl bg-gray-50 p-5"><p className="font-semibold">Contenido</p><ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{document.sections.map(([title], i) => <li key={title}><a href={`#s-${i}`}>{title}</a></li>)}</ol></nav>
    <div className="space-y-8">{document.sections.map(([title, content], i) => <section id={`s-${i}`} key={title}><h2 className="text-xl font-semibold text-gray-950">{title}</h2><p className="mt-3 leading-7">{content}</p></section>)}</div>
    <section className="mt-10 border-t pt-6"><h2 className="font-semibold">Historial de cambios</h2><p className="mt-2 text-sm text-gray-600">{legalConfig.version}: publicación de la base legal para V1.</p></section>
  </main>;
}
