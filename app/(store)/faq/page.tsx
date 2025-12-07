import Link from "next/link";
import { Accordion, 
    AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

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
          Preguntas Frecuentes
        </h1>

        <Accordion
      type="single"
      collapsible
      className="w-full"
      defaultValue="item-1"
    >
      <AccordionItem value="item-1">
        <AccordionTrigger>¿Qué métodos de pago aceptan?</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4 text-balance">
          <p>
          Aceptamos pagos con tarjetas de crédito y débito a través de Stripe, nuestro socio de procesamiento de pagos seguro. Las tarjetas aceptadas incluyen Visa, Mastercard, American Express, y otras.
          </p>
          <p>
          Stripe es un líder mundial en seguridad de pagos y cumple con los estándares más altos de la industria, garantizando que su información financiera esté siempre protegida. Nosotros nunca almacenamos los datos de su tarjeta de crédito.
          </p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>¿Puedo cancelar o modificar mi pedido?</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4 text-balance">
          <p>
          Si desea cancelar o modificar su pedido, contáctenos lo antes posible. Haremos nuestro mejor esfuerzo para ayudarle, pero tenga en cuenta que si el pedido ya ha sido procesado y enviado, no podremos realizar cambios.
          </p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>¿A dónde realizan envíos?</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4 text-balance">
          <p>
          Actualmente realizamos envíos a todo México
          </p>
          <p>
          Los pedidos suelen tardar entre 1 y 2 días hábiles en ser procesados y enviados. Una vez enviado, el tiempo de entrega estimado es de 2 a 12 días hábiles. Tenga en cuenta que estos son solo estimados y pueden variar.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
      </div>
    </div>
  );
}
