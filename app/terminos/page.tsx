import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Términos del Servicio | ElMenu.site",
  description: "Términos del servicio de ElMenu.site, plataforma de pedidos en línea.",
};

const contactEmail = "contacto@elmenu.site";

export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Link href="/" className="text-[#5D6C28] hover:underline">
            ← Volver al inicio
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-[#5D6C28] mb-6">
          Términos del Servicio
        </h1>

        <div className="prose prose-lg max-w-none">
          <p className="text-gray-600 mb-4">
            Última actualización: 8 de junio de 2026
          </p>

          <p className="text-gray-700 mb-6">
            Estos Términos del Servicio regulan el acceso y uso de ElMenu.site,
            una plataforma de pedidos en línea. Al utilizar el sitio, aceptas
            estos términos y te comprometes a usar la plataforma de forma legal
            y responsable.
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              1. Uso de la plataforma
            </h2>
            <p className="text-gray-700 mb-4">
              ElMenu.site permite a los usuarios consultar comercios,
              seleccionar productos y realizar pedidos para entrega o
              recolección cuando esas opciones estén disponibles. El usuario es
              responsable de proporcionar información veraz y actualizada al
              utilizar el servicio.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              2. Pedidos y disponibilidad
            </h2>
            <p className="text-gray-700 mb-4">
              Los productos, precios, horarios, zonas de cobertura y tiempos de
              atención pueden cambiar sin previo aviso. La disponibilidad final
              de un pedido depende del comercio participante, la cobertura y la
              validación operativa correspondiente.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              3. Pagos y responsabilidad del usuario
            </h2>
            <p className="text-gray-700 mb-4">
              Cuando aplique, los pagos se procesan mediante proveedores
              externos. El usuario es responsable de revisar los datos del
              pedido antes de confirmarlo y de contar con autorización para usar
              el método de pago proporcionado.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              4. Conducta permitida
            </h2>
            <p className="text-gray-700 mb-4">
              No está permitido usar ElMenu.site para fines ilícitos,
              fraudulentos, abusivos o que afecten el funcionamiento de la
              plataforma. Podemos limitar o suspender el acceso cuando detectemos
              un uso indebido o contrario a estos términos.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              5. Propiedad intelectual
            </h2>
            <p className="text-gray-700 mb-4">
              El contenido, diseño, marcas, logotipos, textos e interfaces de
              ElMenu.site están protegidos por las leyes aplicables. Salvo que
              se indique lo contrario, no se concede autorización para copiar,
              modificar o distribuir dicho contenido sin permiso previo.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              6. Limitación de responsabilidad
            </h2>
            <p className="text-gray-700 mb-4">
              ElMenu.site actúa como plataforma tecnológica. En la medida
              permitida por la ley, no garantiza disponibilidad continua ni se
              responsabiliza por interrupciones, errores, información incorrecta
              provista por terceros o incumplimientos atribuibles a comercios,
              pasarelas de pago o proveedores externos.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              7. Modificaciones
            </h2>
            <p className="text-gray-700 mb-4">
              Podemos actualizar estos Términos del Servicio en cualquier
              momento. Los cambios surtirán efecto a partir de su publicación en
              esta página.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              8. Contacto
            </h2>
            <p className="text-gray-700 mb-4">
              Si tienes preguntas sobre estos Términos del Servicio, escríbenos
              a
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
