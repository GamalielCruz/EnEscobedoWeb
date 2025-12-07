import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-[#ffffff] text-black pt-12 pb-6 px-4 border-t border-[#d4e400] w-full mt-auto translate-y-44 ">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:justify-between gap-8">
        {/* Brand & Mission */}
        <div className="flex-1 mb-8 md:mb-0">
          <div className="flex items-center gap-3 mb-3">
            <Image src="/logo.svg" alt="Logo" width={40} height={40} className="w-10 h-10"/>
            <span className="font-bold text-2xl tracking-tight text-[#ff8800]">En Escobedo</span>
          </div>
          <p className="text-sm max-w-xs">
            Transformando ideas en productos físicos con impresión 3D, diseño y creatividad. Calidad, innovación y servicio profesional en cada proyecto.
          </p>
        </div>
        {/* Navigation */}
        <div className="flex flex-1 justify-between gap-8">
          {/* <div>
            <h3 className="footer-title mb-2 font-semibold uppercase text-[#5D6C28]">Servicios</h3>
            <ul className="space-y-1 text-sm">
              <li><a href="/servicios/impresion-3d" className="hover:underline">Impresión 3D</a></li>
              <li><a href="/servicios/consultoria" className="hover:underline">Consultoría</a></li>
            </ul>
          </div>
          */}
          <div>
            <h3 className="footer-title mb-2 font-semibold uppercase text-[#ff8800]">Compañía</h3>
            <ul className="space-y-1 text-sm">
            <li>
                <Link href="/about" className="hover:underline">Sobre Nosotros</Link>
              </li>
              <li>
              <Link href="/faq" className="hover:underline">Preguntas Frecuentes</Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="footer-title mb-2 font-semibold uppercase text-[#ff8800]">Legal</h3>
            <ul className="space-y-1 text-sm">
              <li>
                <Link href="/legal/terminos" className="hover:underline">Términos de Uso</Link>
              </li>
              <li>
                <Link href="/legal/privacidad" className="hover:underline">Política de Privacidad</Link>
              </li>
             
            </ul>
          </div>
        </div>
        {/* Contact & Social */}
        <div className="flex-1 mt-8 md:mt-0">
          <h3 className="footer-title mb-2 font-semibold uppercase text-[#ff8800]">Contacto</h3>
          <p className="text-sm mb-2">Email: <a href="mailto:pixel@plastico.com" className="hover:underline">hola@pixelaplastico.com</a></p>
          <p className="text-sm mb-4">Tel: <a href="tel:+5215664104867" className="hover:underline">+52 1 566 410 4867</a></p>
          <div className="flex gap-3 mt-2">
            <a href="https://www.facebook.com/people/Pixel-a-pl%C3%A1stico/61563212441833/" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="hover:text-[#5D6C28]">
              <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M22.675 0h-21.35C.595 0 0 .592 0 1.326v21.348C0 23.408.595 24 1.325 24h11.495v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.797.143v3.24l-1.918.001c-1.504 0-1.797.715-1.797 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116C23.406 24 24 23.408 24 22.674V1.326C24 .592 23.406 0 22.675 0"/></svg>
            </a>
            <a href="https://www.instagram.com/eriblogs_1/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="hover:text-[#5D6C28]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="2" fill="none"/>
                <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" fill="none"/>
                <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor"/>
              </svg>
            </a>
            <a href="https://wa.me/+5215664104867" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="hover:text-[#5D6C28]">
              <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M20.52 3.48A11.93 11.93 0 0 0 12 0C5.37 0 0 5.37 0 12c0 2.11.55 4.16 1.6 5.97L0 24l6.22-1.62A11.93 11.93 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.19-1.24-6.19-3.48-8.52zM12 22c-1.85 0-3.66-.5-5.22-1.44l-.37-.22-3.69.96.99-3.59-.24-.37A9.94 9.94 0 0 1 2 12c0-5.52 4.48-10 10-10s10 4.48 10 10-4.48 10-10 10zm5.2-7.6c-.28-.14-1.65-.81-1.9-.9-.25-.09-.43-.14-.61.14-.18.28-.7.9-.86 1.08-.16.18-.32.2-.6.07-.28-.14-1.18-.44-2.25-1.4-.83-.74-1.39-1.65-1.55-1.93-.16-.28-.02-.43.12-.57.13-.13.28-.34.42-.51.14-.17.18-.29.28-.48.09-.18.05-.36-.02-.5-.07-.14-.61-1.47-.84-2.01-.22-.53-.45-.46-.61-.47-.16-.01-.36-.01-.56-.01-.2 0-.52.07-.8.34-.28.28-1.06 1.04-1.06 2.54 0 1.5 1.09 2.95 1.24 3.16.15.21 2.14 3.28 5.19 4.47.73.31 1.3.5 1.75.64.74.24 1.41.21 1.94.13.59-.09 1.65-.67 1.88-1.32.23-.65.23-1.2.16-1.32-.07-.12-.25-.18-.53-.32z"/></svg>
            </a>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-8 border-t border-[#d4e400] pt-4 flex flex-col md:flex-row items-center justify-between text-xs text-gray-700">
        <span>&copy; {new Date().getFullYear()} Pixel a Plástico. Todos los derechos reservados.</span>
        <span>
          Desarrollado por <a href="tel:+524427958919" className="hover:underline font-semibold" target="_blank" rel="noopener noreferrer">Gamaliel</a>
        </span>
      </div>
    </footer>
  );
}