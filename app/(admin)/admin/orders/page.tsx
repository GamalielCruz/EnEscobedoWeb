import AdminOrdersPanel from "@/components/AdminOrdersPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminOrdersPage() {
  return (
    <div className="px-4 sm:px-0">
      <AdminOrdersPanel />
    </div>
  );
}
