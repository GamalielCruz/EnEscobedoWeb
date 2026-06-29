"use client";

import {
  ClerkLoaded,
  SignInButton,
  UserButton,
  useUser,
} from "@clerk/nextjs";
import Link from "next/link";
import Form from "next/form";
import { SearchIcon, LayoutDashboard } from "lucide-react";
import { PackageIcon, TrolleyIcon } from "@sanity/icons";
import useBasketStore from "@/store/store";
import Image from "next/image";
import { useHydration } from "@/hooks/useHydration";
import { useEffect, useState } from "react";

type OwnedStore = { _id: string; name: string; storeId?: string };

export function Header() {
  const { user, isLoaded } = useUser();
  const isHydrated = useHydration();
  const [ownedStores, setOwnedStores] = useState<OwnedStore[]>([]);
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const itemCount = useBasketStore((state) =>
    state.items.reduce((total, item) => total + item.quantity, 0)
  );

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    console.log("🔥 [Header] useEffect triggered");
    console.log("🔥 [Header] User ID:", user?.id);

    if (!user?.id) {
      console.log("🔥 [Header] No user ID, setting ownedStores to []");
      setOwnedStores([]);
      return;
    }

    console.log("🔥 [Header] Fetching stores for user:", user.id);

    fetch("/api/my-stores")
      .then((res) => {
        console.log("🔥 [Header] API response status:", res.status);
        console.log("🔥 [Header] API response headers:", res.headers);
        return res.json();
      })
      .then((data) => {
        console.log("🔥 [Header] Stores data received:", data);
        const stores = data.stores ?? [];
        console.log("🔥 [Header] Setting ownedStores to:", stores);
        setOwnedStores(stores);
      })
      .catch((error) => {
        console.error("🔥 [Header] Error fetching stores:", error);
        setOwnedStores([]);
      });
  }, [isLoaded, user?.id]);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsVisible(false);
      } else if (currentScrollY < lastScrollY) {
        setIsVisible(true);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [lastScrollY]);

  const shouldShowManagerIcon =
    isHydrated &&
    isLoaded &&
    user &&
    ownedStores.length > 0 &&
    ownedStores.every(
      (store) =>
        store.name &&
        store.name.trim().length > 0 &&
        !store.name.includes("\u200B") &&
        !store.name.includes("\u200D") &&
        !store.name.includes("\uFEFF")
    );

  return (
    <header
      className={`sticky top-0 z-50 w-full bg-white border-b border-gray-100 flex flex-wrap justify-between items-center px-2 py-2 transition-transform duration-300 ease-in-out ${
        isVisible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <div className="w-full ">
        <div className="flex items-center justify-between w-full py-2 sm:py-0 gap-2">
          <Link href="/" className="flex items-center gap-2 group" aria-label="En Escobedo">
            <span className="relative flex items-center justify-center w-10 h-10">
              <Image src="/logomenu.svg" alt="ElMenu Logo" width={40} height={40} className="w-8" />
            </span>
            <span
              className={`relative hidden lg:flex items-center justify-center w-auto h-8 sm:h-10`}
            >
              <Image src="/logo.svg" alt="ElMenu Logo" width={150} height={60} />
            </span>
          </Link>

          <div className="flex-1 flex justify-center sm:justify-end mx-2 lg:max-w-2xl lg:mx-auto">
            <Form action="/search" className="w-full sm:w-80 lg:w-full max-w-lg lg:max-w-full">
              <div className="relative w-full">
                <input
                  type="text"
                  name="query"
                  placeholder="Estoy buscando..."
                  className="
                    border-[#eb1901]
                    text-[#eb1901]
                    px-4
                    py-2
                    rounded-2xl
                    focus:outline-none
                    focus:ring-2
                    focus:ring-[#eb1901]
                    focus:ring-opacity-50
                    focus:ring-offset-2
                    focus:ring-offset-[#eb1901]
                    placeholder:text-[#eb1901]
                    border
                    w-full
                    pr-10
                    text-base
                  "
                />
                <span className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-[#eb1901]">
                  <SearchIcon className="w-5 h-5" />
                </span>
              </div>
            </Form>
          </div>

          <div className="flex items-center gap-2 ml-2">
            <Link
              href="/basket"
              className="relative flex items-center justify-center bg-[#eb1901] hover:bg-[#eb1901]/80 text-gray-50 font-bold py-2 px-3 rounded"
              aria-label="Ver carrito"
            >
              <TrolleyIcon className="w-6 h-6" />
              {isHydrated && itemCount !== 0 && (
                <span className="absolute -top-1 -right-1 text-xs bg-[#eb1901] text-white rounded-full w-5 h-5 flex items-center justify-center font-bold animate-pulse">
                  {itemCount}
                </span>
              )}
              <span className="hidden sm:block">Carrito</span>
            </Link>

            <Link
              href="/orders"
              className="relative flex items-center justify-center bg-[#eb1901] hover:bg-[#eb1901]/80 text-gray-50 font-bold py-2 px-3 rounded"
            >
              <PackageIcon className="w-6 h-6" />
              <span className="hidden sm:block">Pedidos</span>
            </Link>

            {shouldShowManagerIcon ? (
              <Link
                href="/dashboard"
                className="relative flex items-center justify-center bg-[#eb1901] hover:bg-[#eb1901]/80 text-gray-50 font-bold py-2 px-3 rounded"
                aria-label="Panel del restaurante"
              >
                <LayoutDashboard className="w-6 h-6" />
                <span className="hidden sm:block">Manager</span>
              </Link>
            ) : null}

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
                    <path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z" />
                  </svg>
                </SignInButton>
              )}
            </ClerkLoaded>

            <ClerkLoaded>
              {user && (
                <div className="flex items-center space-x-2">
                  <div className="hidden sm:block text-xs">
                    <p className="text-gray-900">Buen dia,</p>
                    <p className="font-bold text-gray-900">{user.firstName}!</p>
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
