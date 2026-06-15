import { redirect } from "next/navigation";

export default function LegacyPendingProductsPage() {
  redirect("/admin/pending-products");
}
