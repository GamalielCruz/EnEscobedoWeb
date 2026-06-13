import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Eliminación de Datos | ElMenu.site",
  description: "Información para solicitar la eliminación de datos de usuario en ElMenu.site.",
};

const contactEmail = "contacto@elmenu.site";

export default function EliminacionDatosPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Link href="/" className="text-[#5D6C28] hover:underline">
            ← Volver al inicio
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-[#5D6C28] mb-6">
          Solicitud de Eliminación de Datos
        </h1>

        <div className="prose prose-lg max-w-none">
          <p className="text-gray-600 mb-4">
            Última actualización: 8 de junio de 2026
          </p>

          <p className="text-gray-700 mb-6">
            Si utilizaste ElMenu.site, nuestra plataforma de pedidos en línea, y
            deseas solicitar la eliminación de tus datos personales, puedes
            hacerlo enviando un correo electrónico a nuestro equipo de atención.
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              Cómo solicitar la eliminación
            </h2>
            <p className="text-gray-700 mb-4">
              Envía un correo a
              <a
                href={`mailto:${contactEmail}`}
                className="text-[#5D6C28] hover:underline ml-1"
              >
                {contactEmail}
              </a>
              indicando que deseas eliminar tus datos personales asociados con
              tu uso de ElMenu.site.
            </p>
            <p className="text-gray-700 mb-4">
              Para ayudarnos a localizar tu información con mayor rapidez,
              incluye en tu solicitud tu nombre, número telefónico, correo
              electrónico y cualquier dato adicional que hayas usado al realizar
              pedidos o contactar al servicio.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              Qué sucede después
            </h2>
            <p className="text-gray-700 mb-4">
              Revisaremos la solicitud y podremos pedir información adicional
              para verificar tu identidad antes de procesarla. Una vez validada,
              eliminaremos o anonimizaremos los datos personales que podamos
              borrar conforme a la legislación aplicable y a nuestras
              obligaciones legales, fiscales, de seguridad o prevención de
              fraude.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              Excepciones
            </h2>
            <p className="text-gray-700 mb-4">
              Algunos datos podrían conservarse temporalmente cuando exista una
              obligación legal, contractual o de seguridad que lo justifique.
              En esos casos, restringiremos su uso a lo estrictamente necesario.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              Contacto
            </h2>
            <p className="text-gray-700 mb-4">
              Si tienes preguntas sobre este proceso, contáctanos en
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
