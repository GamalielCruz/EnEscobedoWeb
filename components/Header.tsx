"use client";

import {
  ClerkLoaded,
  SignedIn,
  SignInButton,
  UserButton,
  useUser,
} from "@clerk/nextjs";
import Link from "next/link";
import Form from "next/form";
import { SearchIcon } from "lucide-react";
import { PackageIcon, TrolleyIcon } from "@sanity/icons";
import useBasketStore from "@/store/store";
import Image from "next/image";
import { Aoboshi_One } from "next/font/google";
import { useHydration } from "@/hooks/useHydration";

const aoboshiOne = Aoboshi_One({
  subsets: ["latin"],
  weight: ["400"],
});

export function Header() {
  const { user } = useUser();
  const isHydrated = useHydration();
  const itemCount = useBasketStore((state) => 
   state.items.reduce((total, item) => total + item.quantity, 0)
  );

  const createClerkPasskey = async () => {
    try {
      const response = await user?.createPasskey();
      console.log(response);
    } catch (err) {
      console.log("Error:", JSON.stringify(err, null, 2));
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm flex flex-wrap justify-between items-center px-2 py-2">
      <div className="w-full ">
        {/* Top bar: Logo, Search, Basket, User */}
        <div className="flex items-center justify-between w-full py-2 sm:py-0 gap-2">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 group"
            aria-label="En Escobedo"
          >
            <span className="relative flex items-center justify-center w-10 h-10 group-hover:scale-110 transition-transform duration-200 overflow-hidden">
              <Image
                src="/logo.svg"
                alt="En Escobedo Logo"
                width={36}
                height={36}
              />
            </span>
            {/* Show brand name only on sm+ */}
            <span
              className={`${aoboshiOne.className} text-md sm:text-2xl font-bold text-[#ff8800] tracking-tight group-hover:opacity-80 transition-opacity duration-200 hidden md:inline`}
            >
              En Escobedo
            </span>
          </Link>

          {/* Search bar: move to the right side on desktop, below on mobile */}
          <div className="flex-1 flex justify-center sm:justify-end mx-2 lg:max-w-2xl lg:mx-auto">
            <Form
              action="/search"
              className="w-full sm:w-80 lg:w-full max-w-lg lg:max-w-full"
            >
              <div className="relative w-full">
                <input
                  type="text"
                  name="query"
                  placeholder="Estoy buscando..."
                  className="
                    border-[#ff8800]
                    text-[#ff8800]
                    px-4
                    py-2
                    rounded-2xl
                    focus:outline-none
                    focus:ring-2
                    focus:ring-[#ff8800]
                    focus:ring-opacity-50
                    focus:ring-offset-2
                    focus:ring-offset-[#ff8800]
                    placeholder:text-[#ff8800]
                    border
                    w-full
                    pr-10
                    text-base
                  "
                />
                <span className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-[#ff8800]">
                  <SearchIcon className="w-5 h-5" />
                </span>
              </div>
            </Form>
          </div>

          {/* Basket & User/SignIn */}
          <div className="flex items-center gap-2 ml-2">
            <Link
              href="/basket"
              className="relative flex items-center justify-center bg-[#ff8800] hover:bg-[#ff8800]/80 text-gray-900 font-bold py-2 px-3 rounded"
              aria-label="Ver carrito"
            >
              <TrolleyIcon className="w-6 h-6" />
              {isHydrated && itemCount !== 0 && (
                <span className="absolute -top-1 -right-1 text-xs bg-[#ff8800] text-black rounded-full w-5 h-5 flex items-center justify-center font-bold animate-pulse">
                  {itemCount}
                </span>
              )}
              <span className="hidden sm:block">Carrito</span>
            </Link>

            <Link
            href="/orders"
            className="flex-1 relative flex justify-center sm:justify-start sm:flex-none items-center space-x-2 bg-[#ff8800] hover:bg-[#ff8800]/80 text-gray-900 font-bold py-2 px-4 rounded"
          >
            <PackageIcon className="w-6 h-6" />
            <span className="hidden sm:block">Pedidos</span>
          </Link>


            
            <ClerkLoaded>
              {user ? (
                <div className="flex items-center">
                  <UserButton />
                </div>
              ) : (
                <SignInButton mode="modal">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-6 h-6 text-black"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z"/>
                  </svg>
                </SignInButton>
              )}
            </ClerkLoaded>

            <ClerkLoaded>
            {user && (
              <div className="flex items-center space-x-2">
                {/* UserButton already shown above, so only show name here */}
                <div className="hidden sm:block text-xs">
                  <p className="text-gray-900">Buen dia,</p>
                  <p className="font-bold text-gray-900">{user.fullName}!</p>
                </div>
              </div>
            )}
            
          </ClerkLoaded>
          </div>
        </div>

      
      </div>
    </header>
  );
}

export default Header;
