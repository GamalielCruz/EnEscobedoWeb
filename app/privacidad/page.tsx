import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidad | ElMenu.site",
  description: "Política de privacidad de ElMenu.site, plataforma de pedidos en línea.",
};

const contactEmail = "contacto@elmenu.site";

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Link href="/" className="text-[#5D6C28] hover:underline">
            ← Volver al inicio
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-[#5D6C28] mb-6">
          Política de Privacidad
        </h1>

        <div className="prose prose-lg max-w-none">
          <p className="text-gray-600 mb-4">
            Última actualización: 8 de junio de 2026
          </p>

          <p className="text-gray-700 mb-6">
            En ElMenu.site valoramos la privacidad de nuestros usuarios. Esta
            Política de Privacidad explica qué datos podemos recopilar cuando
            utilizas nuestra plataforma de pedidos en línea, cómo los usamos y
            qué opciones tienes respecto a tu información.
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              1. Información que recopilamos
            </h2>
            <p className="text-gray-700 mb-4">
              Podemos recopilar información que proporcionas directamente, como
              tu nombre, número telefónico, correo electrónico, dirección de
              entrega, datos necesarios para completar pedidos y cualquier otra
              información que compartas al comunicarte con nosotros o al usar
              formularios dentro de la plataforma.
            </p>
            <p className="text-gray-700 mb-4">
              También podemos recopilar información técnica y de uso, como tu
              dirección IP, tipo de dispositivo, navegador, páginas visitadas y
              eventos relacionados con la navegación y el proceso de compra.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              2. Cómo usamos tu información
            </h2>
            <p className="text-gray-700 mb-4">
              Usamos la información para operar ElMenu.site, procesar pedidos,
              mostrar comercios o productos disponibles, coordinar entregas o
              recolecciones, brindar soporte al usuario, enviar confirmaciones y
              mejorar la seguridad y el funcionamiento de la plataforma.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              3. Compartir información
            </h2>
            <p className="text-gray-700 mb-4">
              Podemos compartir información únicamente cuando sea necesario para
              prestar el servicio, por ejemplo con comercios afiliados,
              proveedores tecnológicos, procesadores de pago, servicios de
              mensajería o autoridades competentes cuando exista obligación
              legal.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              4. Conservación y seguridad
            </h2>
            <p className="text-gray-700 mb-4">
              Conservamos la información durante el tiempo necesario para operar
              el servicio, cumplir obligaciones legales, resolver disputas y
              prevenir fraudes. Aplicamos medidas razonables de seguridad para
              proteger los datos contra acceso no autorizado, pérdida o uso
              indebido.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              5. Derechos del usuario
            </h2>
            <p className="text-gray-700 mb-4">
              Puedes solicitar acceso, corrección o eliminación de tus datos
              personales, así como realizar consultas sobre el tratamiento de tu
              información. Para ejercer estos derechos, contáctanos por correo
              electrónico.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              6. Contacto
            </h2>
            <p className="text-gray-700 mb-4">
              Si tienes dudas sobre esta Política de Privacidad o deseas ejercer
              tus derechos sobre tus datos personales, escríbenos a
              <a
                href={`mailto:${contactEmail}`}
                className="text-[#5D6C28] hover:underline ml-1"
              >
                {contactEmail}
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
