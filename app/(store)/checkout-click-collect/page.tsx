import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import ClickCollectCheckout from "../../../components/ClickCollectCheckout";

async function ClickCollectCheckoutPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  return (
    <div className="container mx-auto px-4 py-8 translate-y-[70px]">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Pago en Tienda
        </h1>
        <ClickCollectCheckout />
      </div>
    </div>
  );
}

export default ClickCollectCheckoutPage;
