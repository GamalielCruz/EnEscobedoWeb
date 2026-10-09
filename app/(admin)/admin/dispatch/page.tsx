import { DispatchCenter } from "@/components/dispatch/DispatchCenter";

export const metadata = {
  title: "Dispatch Center - ElMenu Admin",
  description: "Centro de operaciones para supervisar y controlar las asignaciones de pedidos en tiempo real.",
};

export default function AdminDispatchPage() {
  return <DispatchCenter />;
}
