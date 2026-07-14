import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-[#ffffff] text-black pt-12 pb-6 px-4  w-full mt-auto translate-y-44 ">
      <div className="max-w-7xl mx-auto mt-8 border-t border-[#eb1922] pt-4 flex flex-col items-center justify-between gap-3 text-xs text-gray-700 md:flex-row">
        <span>&copy; {new Date().getFullYear()} ElMenu.site</span>
        <nav className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/privacidad" className="hover:underline">
            Privacidad
          </Link>
          <Link href="/terminos" className="hover:underline">
            Términos
          </Link>
          <Link href="/eliminacion-datos" className="hover:underline">
            Eliminación de datos
          </Link>
        </nav>
        <span>
          Desarrollado por{" "}
          <a
            href="https://github.com/GamalielCruz"
            className="font-semibold hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Garoga Communications
          </a>
        </span>
      </div>
    </footer>
  );
}
