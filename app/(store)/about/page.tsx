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
          Sobre Nosotros
        </h1>

        <div className="prose prose-lg max-w-none">
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#5D6C28] mb-4">
              ¡Hola! Somos Pixel A Plástico, y estamos encantados de que nos
              visites.
            </h2>
            <p className="text-gray-700 mb-4">
              Creemos que las compras en línea pueden ser una experiencia tan
              personal y satisfactoria como las compras en una tienda física, o
              cada producto que compres debe contarte una historia.
            </p>
            <p className="text-[#5D6C28] mb-4">
            Lo que nos hace únicos:
            </p>
            <p className="text-gray-700 mb-4">
            Nos apasiona la excelencia y seleccionamos cuidadosamente cada producto para garantizar que cumpla con nuestros altos estándares de calidad y durabilidad.
            <br />
            Experiencia de compra personalizada. Estamos aquí para ayudarte en cada paso del camino. Tu satisfacción es nuestra prioridad y siempre estaremos listos para responder a tus preguntas.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
