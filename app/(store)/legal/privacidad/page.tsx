import Link from "next/link";

export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-white translate-y-12">
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
            Última actualización: 26 de agosto de 2025
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              1. Información que Recopilamos
            </h2>
            <p className="text-gray-700 mb-4">
              Información de Identificación Personal (IIP): Es información que
              puede identificarlo directamente, como su nombre, dirección de
              correo electrónico, dirección postal, número de teléfono y
              detalles de pago (como la información de su tarjeta de crédito,
              manejada de forma segura a través de Stripe). <br />
              Recopilamos esta información cuando realiza una compra, se
              suscribe a nuestro boletín, se pone en contacto con nosotros o
              crea una cuenta. Información de Identificación No Personal: Es
              información que no lo identifica directamente. Esto incluye datos
              de uso del sitio (como las páginas que visita, el tiempo que
              permanece en ellas y los productos que ve), el tipo de navegador
              que utiliza, su dirección IP y la forma en que interactúa con el
              Sitio. Recopilamos esta información a través de cookies y otras
              tecnologías de seguimiento.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              2. ¿Cómo Usamos su Información?
            </h2>
            <p className="text-gray-700 mb-4">
              Procesar sus pedidos y transacciones: Para completar sus compras,
              procesar pagos y enviar los productos.
              <br />
              Mejorar nuestros servicios: Analizamos la información no personal
              para entender cómo se utiliza el Sitio y mejorar su funcionalidad,
              diseño y el contenido que ofrecemos.
              <br />
              Comunicarnos con usted: Para responder a sus preguntas, enviarle
              confirmaciones de pedidos, notificaciones de envío y, si lo ha
              solicitado, correos electrónicos de marketing sobre nuevos
              productos u ofertas especiales.
              <br />
              Garantizar la seguridad: Para prevenir fraudes, proteger la
              integridad de nuestro Sitio y garantizar que se cumplan nuestros
              Términos y Condiciones. <br />
              Personalizar su experiencia: Para mostrarle productos y contenido
              que puedan ser de su interés.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              3. Compartir su Información
            </h2>
            <p className="text-gray-700 mb-4">
              No vendemos, alquilamos ni compartimos su Información de
              Identificación Personal con terceros, excepto en las siguientes
              circunstancias:
              <br />
              Proveedores de servicios: Compartimos su información con empresas
              que nos ayudan a operar nuestro negocio, como procesadores de pago
              (Stripe), servicios de envío y análisis de datos. Estos terceros
              solo tienen acceso a la información necesaria para realizar sus
              funciones y están obligados a proteger su información de manera
              similar a como lo hacemos nosotros.
              <br />
              Requisitos legales: Podemos divulgar su información si la ley lo
              exige, en respuesta a una orden judicial o para proteger nuestros
              derechos, propiedad o seguridad, o los de otros.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              4. Cookies y Tecnologías de Seguimiento
            </h2>
            <p className="text-gray-700 mb-4">
              El Sitio utiliza cookies para mejorar su experiencia de
              navegación. Las cookies son pequeños archivos de texto que se
              almacenan en su dispositivo y nos ayudan a recordar sus
              preferencias, mantener su sesión iniciada y recopilar datos de
              uso. Puede configurar su navegador para que rechace todas las
              cookies o para que le avise cuando se envíe una. Sin embargo, si
              deshabilita las cookies, es posible que algunas partes del Sitio
              no funcionen correctamente.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              5. Sus Derechos
            </h2>
            <p className="text-gray-700 mb-4">
              Usted tiene derecho a: Acceder y corregir la información personal
              que tenemos sobre usted. Solicitar la eliminación de su
              información personal. Oponerse al procesamiento de su información
              personal para ciertos fines. Retirar su consentimiento en
              cualquier momento si el procesamiento se basa en su
              consentimiento. Para ejercer cualquiera de estos derechos, por
              favor, póngase en contacto con nosotros a través de la información
              proporcionada en la sección: contacto.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              6. Seguridad de los Datos
            </h2>
            <p className="text-gray-700 mb-4">
              Nos comprometemos a proteger su información. Utilizamos medidas de
              seguridad administrativas, técnicas y físicas para ayudar a
              proteger la Información de Identificación Personal contra el
              acceso no autorizado, el uso indebido o la divulgación.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              7. Enlaces a Sitios de Terceros
            </h2>
            <p className="text-gray-700 mb-4">
              Nuestro Sitio puede contener enlaces a otros sitios web que no son
              operados por nosotros. Si hace clic en un enlace de terceros, será
              dirigido a ese sitio. Le recomendamos encarecidamente que revise
              la Política de Privacidad de cada sitio que visite. No tenemos
              control ni asumimos ninguna responsabilidad por el contenido, las
              políticas de privacidad o las prácticas de los sitios o servicios
              de terceros.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              8. Cambios en esta Política de Privacidad
            </h2>
            <p className="text-gray-700 mb-4">
              Podemos actualizar nuestra Política de Privacidad de vez en
              cuando. Le notificaremos cualquier cambio publicando la nueva
              Política de Privacidad en esta página. Se le aconseja revisar esta
              Política de Privacidad periódicamente para cualquier cambio. Los
              cambios en esta Política de Privacidad son efectivos cuando se
              publican en esta página.
            </p>
          </section>

         
        </div>
      </div>
    </div>
  );
}
