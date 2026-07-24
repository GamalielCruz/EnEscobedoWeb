import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Inter } from "next/font/google";
import { AdminShell } from "@/components/admin/AdminShell";
import { isAdminUser } from "@/lib/admin";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Admin Panel - Store",
  description: "Panel de administracion para gestionar ordenes y tienda",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  if (!isAdminUser(userId)) {
    redirect("/access-denied");
  }

  return <AdminShell className={inter.className}>{children}</AdminShell>;
}
