import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-[#ffffff] text-black pt-12 pb-6 px-4  w-full mt-auto translate-y-44 ">
      <div className="max-w-7xl mx-auto mt-8 border-t border-[#eb1922] pt-4 flex flex-col md:flex-row items-center justify-between text-xs text-gray-700">
        <span>&copy; {new Date().getFullYear()} ElMenu.site</span>
        <span>
          Desarrollado por <a href="https://github.com/GamalielCruz" className="hover:underline font-semibold" target="_blank" rel="noopener noreferrer">Gamaliel</a>
        </span>
      </div>
    </footer>
  );
}