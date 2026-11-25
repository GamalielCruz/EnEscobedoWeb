import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { CustomerProfile } from "@/components/ratings/CustomerProfile";

export const dynamic = "force-dynamic";

/**
 * /mi-perfil — perfil del cliente.
 *
 * Identidad desde Clerk (el cliente no vive en Sanity); la reputación se
 * calcula con las evaluaciones de 3★ que los repartidores le dejaron.
 */
export default async function MiPerfilPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent("/mi-perfil")}`);
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-gray-50 p-4 pt-6 sm:pt-8">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Mi perfil</h1>
        <p className="mt-1 text-sm text-gray-500">Tu reputación como cliente de ElMenu</p>
        <div className="mt-6">
          <CustomerProfile />
        </div>
      </div>
    </div>
  );
}
