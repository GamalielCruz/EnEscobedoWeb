import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import CashOnDeliveryCheckout from "../../../components/CashOnDeliveryCheckout";

async function CashOnDeliveryPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <CashOnDeliveryCheckout />
    </div>
  );
}

export default CashOnDeliveryPage;
