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
import { usePathname } from "next/navigation";
import { AddressPicker } from "@/components/AddressPicker";

type OwnedStore = { _id: string; name: string; storeId?: string };

export function Header() {
  const { user, isLoaded } = useUser();
  const pathname = usePathname();
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

    setOwnedStores([]);

    console.log("🔥 [Header] useEffect triggered");
    console.log("🔥 [Header] User ID:", user?.id);

    if (!user?.id) {
      console.log("🔥 [Header] No user ID, setting ownedStores to []");
      setOwnedStores([]);
      return;
    }

    console.log("🔥 [Header] Fetching stores for user:", user.id);

    let cancelled = false;

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
        if (!cancelled) setOwnedStores(stores);
      })
      .catch((error) => {
        console.error("🔥 [Header] Error fetching stores:", error);
        if (!cancelled) setOwnedStores([]);
      });

    return () => {
      cancelled = true;
    };
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
    Boolean(user) &&
    ownedStores.length > 0;

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b border-gray-100 bg-white px-3 py-2 transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
        isVisible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <div className="w-full">
        <div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1.5 gap-y-1 sm:gap-x-2">
          <div className="col-start-1 row-start-1 flex shrink-0 items-center">
            <Link href="/" className="flex items-center gap-2 group" aria-label="En Escobedo">
              <span className="relative flex h-10 w-10 items-center justify-center sm:h-11 sm:w-11">
                <Image src="/logomenu.svg" alt="ElMenu Logo" width={40} height={40} className="h-8 w-8" priority />
              </span>
              <span
                className={`relative hidden lg:flex items-center justify-center w-auto h-8 sm:h-10`}
              >
                <Image src="/logo.svg" alt="ElMenu Logo" width={150} height={60} className="h-auto w-[150px]" priority />
              </span>
            </Link>
          </div>

          <div className="col-start-2 col-end-3 row-start-1 min-w-0 sm:px-2 lg:mx-auto lg:w-full lg:max-w-2xl">
            <Form action="/search" className="w-full sm:max-w-lg lg:max-w-full">
              <div className="relative w-full">
                <input
                  type="text"
                  name="query"
                  placeholder="Estoy buscando..."
                  className="
                    border-[#eb1901]
                    text-[#eb1901]
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
                    h-10
                    w-full
                    min-w-0
                    pl-3
                    pr-10
                    text-sm
                    sm:h-11
                    sm:pl-4
                    sm:text-base
                  "
                />
                <button
                  type="submit"
                  aria-label="Buscar"
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[#eb1901]"
                >
                  <SearchIcon className="w-5 h-5" />
                </button>
              </div>
            </Form>
          </div>

          <div className="col-start-3 row-start-1 flex items-center gap-1 sm:gap-2">
            <Link
              href="/basket"
              className="relative flex h-10 min-w-10 items-center justify-center rounded-xl bg-[#eb1901] px-2 font-bold text-gray-50 hover:bg-[#eb1901]/80 sm:h-11 sm:min-w-11 sm:px-2.5 lg:gap-1 lg:px-3"
              aria-label="Ver carrito"
            >
              <TrolleyIcon className="w-6 h-6" />
              {isHydrated && itemCount !== 0 && (
                <span
                  key={itemCount}
                  className="cart-count-pop absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#eb1901] text-xs font-bold text-white"
                >
                  {itemCount}
                </span>
              )}
              <span className="hidden lg:block">Carrito</span>
            </Link>

            <Link
              href="/orders"
              className="relative flex h-10 min-w-10 items-center justify-center rounded-xl bg-[#eb1901] px-2 font-bold text-gray-50 hover:bg-[#eb1901]/80 sm:h-11 sm:min-w-11 sm:px-2.5 lg:gap-1 lg:px-3"
              aria-label="Pedidos"
            >
              <PackageIcon className="w-6 h-6" />
              <span className="hidden lg:block">Pedidos</span>
            </Link>

            {shouldShowManagerIcon ? (
              <Link
                href="/dashboard"
                className="relative flex h-10 min-w-10 items-center justify-center rounded-xl bg-[#eb1901] px-2 font-bold text-gray-50 hover:bg-[#eb1901]/80 sm:h-11 sm:min-w-11 sm:px-2.5 lg:gap-1 lg:px-3"
                aria-label="Panel del restaurante"
              >
                <LayoutDashboard className="w-6 h-6" />
                <span className="hidden lg:block">Manager</span>
              </Link>
            ) : null}

            <ClerkLoaded>
              {user ? (
                <div className="flex min-w-9 items-center justify-center">
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
          {pathname === "/" && isLoaded && user && (
            <div className="col-start-1 col-end-4 row-start-2 min-w-0">
              <AddressPicker userId={user.id} />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
