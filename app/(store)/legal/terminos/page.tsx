import Link from "next/link";

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
          Términos y Condiciones de Uso
        </h1>
        
        <div className="prose prose-lg max-w-none">
          <p className="text-gray-600 mb-4">
            Última actualización: 26 de agosto de 2025
          </p>
          
          <p className="text-gray-700 mb-4">
            Bienvenido a https://pixelaplastico.com/
          </p>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              1. Aceptación de los Términos
            </h2>
            <p className="text-gray-700 mb-4">
              Al acceder y utilizar este sitio web, usted acepta estar sujeto a estos términos y condiciones de uso. 
              Si no está de acuerdo con alguna parte de estos términos, no debe utilizar nuestros servicios.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              2. Descripción del Servicio
            </h2>
            <p className="text-gray-700 mb-4">
              Pixel a Plástico ofrece servicios de impresión 3D, diseño y consultoría. 
              Nuestros servicios incluyen la creación de productos físicos a partir de diseños digitales, 
              asesoramiento técnico y soluciones personalizadas para proyectos de impresión 3D.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              3. Registro de Usuario
            </h2>
            <p className="text-gray-700 mb-4">
              Para realizar compras en nuestro sitio web, deberá crear una cuenta de usuario. 
              Usted es responsable de mantener la confidencialidad de su información de acceso y 
              de todas las actividades que ocurran bajo su cuenta. Debe proporcionar información 
              precisa y actualizada durante el proceso de registro.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              4. Pagos y Facturación
            </h2>
            <p className="text-gray-700 mb-4">
              Todos los precios están expresados en pesos mexicanos (MXN) e incluyen IVA. 
              Los pagos se procesan de forma segura a través de Stripe. Al realizar una compra, 
              usted autoriza a Pixel a Plástico a cobrar el monto total de su pedido. 
              Los pagos son procesados inmediatamente al momento de la compra.
            </p>
            <p className="text-gray-700 mb-4">
              Nos reservamos el derecho de rechazar cualquier pedido o cancelar cualquier transacción 
              en caso de problemas con el procesamiento del pago o por cualquier otra razón a nuestra 
              discreción.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              5. Envíos y Entregas
            </h2>
            <p className="text-gray-700 mb-4">
              Los envíos se realizan únicamente dentro del territorio de México, mediante servicios de paquetería confiables.
            </p>
            <p className="text-gray-700 mb-4">
              El tiempo estimado de entrega es de 3 a 7 días hábiles, dependiendo de la ciudad de destino y la disponibilidad de la paquetería. En periodos de alta demanda (como temporadas festivas, promociones especiales o causas de fuerza mayor), los tiempos de entrega podrían extenderse.
            </p>
            <p className="text-gray-700 mb-4">
              Los costos de envío se calculan y muestran al cliente antes de confirmar la compra. Dichos costos corren a cargo del cliente, salvo en promociones especiales en las que se ofrezca envío gratuito.
            </p>
            <p className="text-gray-700 mb-4">
              Una vez que el pedido haya sido entregado a la empresa de paquetería, el cliente recibirá un número de guía o rastreo para dar seguimiento al envío.
            </p>
            <p className="text-gray-700 mb-4">
              El Sitio no se hace responsable por retrasos, daños o pérdidas atribuibles directamente a la empresa de paquetería.
            </p>
            <p className="text-gray-700 mb-4">
              Es responsabilidad del cliente proporcionar una dirección de entrega completa y correcta. En caso de errores en los datos de envío, cualquier gasto adicional generado será cubierto por el cliente.
            </p>
            <p className="text-gray-700 mb-4">
              En caso de que la paquetería no logre entregar el paquete por ausencia del destinatario en la dirección indicada, el cliente será responsable de coordinar una nueva entrega o recolección en la oficina de la paquetería correspondiente.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              6. Uso Aceptable
            </h2>
            <p className="text-gray-700 mb-4">
              Usted se compromete a utilizar nuestros servicios únicamente para fines legales y éticos. 
              No está permitido el uso de nuestros servicios para crear objetos ilegales, peligrosos o que 
              infrinjan derechos de propiedad intelectual de terceros.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              7. Propiedad Intelectual
            </h2>
            <p className="text-gray-700 mb-4">
              Todos los diseños, logos, marcas comerciales y contenido de este sitio web son propiedad de 
              Pixel a Plástico o están utilizados con permiso. Los clientes conservan los derechos sobre 
              sus propios diseños originales.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              8. Limitación de Responsabilidad
            </h2>
            <p className="text-gray-700 mb-4">
              Pixel a Plástico no será responsable por daños indirectos, incidentales o consecuentes que 
              puedan surgir del uso de nuestros servicios. Nuestra responsabilidad total estará limitada 
              al monto pagado por el servicio específico.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              9. Modificaciones
            </h2>
            <p className="text-gray-700 mb-4">
              Nos reservamos el derecho de modificar estos términos en cualquier momento. 
              Los cambios entrarán en vigor inmediatamente después de su publicación en este sitio web.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              10. Contacto
            </h2>
            <p className="text-gray-700 mb-4">
              Si tiene alguna pregunta sobre estos términos de uso, puede contactarnos en: 
              <a href="mailto:hola@pixelaplastico.com" className="text-[#5D6C28] hover:underline ml-1">
                hola@pixelaplastico.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
