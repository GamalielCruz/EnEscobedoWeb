import Link from "next/link";
import { LEGAL_SUPPORT_EMAIL } from "@/lib/legal-config";

export default function Footer() {
  return <footer className="mt-auto w-full bg-white px-4 pb-6 pt-12 text-black">
    <div className="mx-auto mt-8 flex max-w-7xl flex-col items-center justify-between gap-3 border-t border-[#eb1922] pt-4 text-xs text-gray-700 md:flex-row">
      <span>© {new Date().getFullYear()} ElMenu.site</span>
      <nav aria-label="Enlaces del sitio" className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/demo" className="font-semibold text-[#c81400] hover:underline">Demostración</Link>
        <a href="https://wa.me/524462562451?text=Hola%2C%20quiero%20conocer%20ElMenu%20y%20registrar%20mi%20restaurante." target="_blank" rel="noopener noreferrer" className="font-semibold text-[#c81400] hover:underline">Registra tu restaurante</a>
        <Link href="/legal" className="hover:underline">Centro legal</Link>
        <Link href="/legal/privacidad" className="hover:underline">Privacidad</Link>
        <Link href="/legal/terminos-clientes" className="hover:underline">Términos</Link>
        <Link href="/legal/cancelaciones-reembolsos" className="hover:underline">Cancelaciones</Link>
        <Link href="/legal/contacto" className="hover:underline">Contacto</Link>
        <a href={`mailto:${LEGAL_SUPPORT_EMAIL}`} className="hover:underline">{LEGAL_SUPPORT_EMAIL}</a>
      </nav>
      <span>Desarrollado por <a href="https://github.com/GamalielCruz" className="font-semibold hover:underline" target="_blank" rel="noopener noreferrer">Garoga Communications</a></span>
    </div>
  </footer>;
}
