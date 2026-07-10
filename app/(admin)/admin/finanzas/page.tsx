import { getAdminFinanceSnapshot } from "@/lib/admin-finance";
import { formatMoney } from "@/lib/mexico-time";

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{formatMoney(value)}</p>
    </div>
  );
}

function MetricsTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    id: string;
    name: string;
    orders: number;
    grossTotal: number;
    stripeSales: number;
    cashAtStoreSales: number;
    driverCollectedCash: number;
    stripeFee: number;
    platformCommission: number;
    storeNetTotal: number;
    pendingSettlement: number;
  }>;
}) {
  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Pedidos</th>
              <th className="px-4 py-3">Total vendido</th>
              <th className="px-4 py-3">Online</th>
              <th className="px-4 py-3">Cobrado tienda</th>
              <th className="px-4 py-3">Cobrado repartidor</th>
              <th className="px-4 py-3">Stripe</th>
              <th className="px-4 py-3">Comision ElMenu</th>
              <th className="px-4 py-3">Neto tienda</th>
              <th className="px-4 py-3">Pendiente liquidar</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-gray-500">Sin movimientos para el dia seleccionado.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                  <td className="px-4 py-3 text-gray-700">{row.orders}</td>
                  <td className="px-4 py-3 text-gray-700">{formatMoney(row.grossTotal)}</td>
                  <td className="px-4 py-3 text-gray-700">{formatMoney(row.stripeSales)}</td>
                  <td className="px-4 py-3 text-gray-700">{formatMoney(row.cashAtStoreSales)}</td>
                  <td className="px-4 py-3 text-gray-700">{formatMoney(row.driverCollectedCash)}</td>
                  <td className="px-4 py-3 text-gray-700">{formatMoney(row.stripeFee)}</td>
                  <td className="px-4 py-3 text-gray-700">{formatMoney(row.platformCommission)}</td>
                  <td className="px-4 py-3 text-gray-700">{formatMoney(row.storeNetTotal)}</td>
                  <td className="px-4 py-3 text-gray-700">{formatMoney(row.pendingSettlement)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function AdminFinanzasPage({ searchParams }: { searchParams?: Promise<{ date?: string }> }) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const snapshot = await getAdminFinanceSnapshot(resolvedSearchParams.date);

  return (
    <div className="space-y-6 px-4 sm:px-0">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-[#ff8800]">Admin / Finanzas</p>
        <h1 className="text-3xl font-bold text-gray-900">Corte diario</h1>
        <p className="mt-2 max-w-3xl text-gray-600">Corte calculado en backend con timezone America/Mexico_City para {snapshot.dateKey}.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Total bruto" value={snapshot.totals.grossTotal} />
        <SummaryCard title="Pagado online" value={snapshot.totals.onlinePaidSales} />
        <SummaryCard title="Cobrado en tienda" value={snapshot.totals.storeCollectedCash} />
        <SummaryCard title="Cobrado por repartidor" value={snapshot.totals.driverCollectedCash} />
        <SummaryCard title="Stripe fee" value={snapshot.totals.stripeFee} />
        <SummaryCard title="Comision ElMenu" value={snapshot.totals.platformCommission} />
        <SummaryCard title="Pago repartidor" value={snapshot.totals.driverPayout} />
        <SummaryCard title="Pendiente por liquidar" value={snapshot.totals.pendingSettlement} />
      </div>

      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <div><p className="text-sm text-gray-500">Delivery</p><p className="mt-1 font-semibold text-gray-900">{formatMoney(snapshot.totals.deliverySales)}</p></div>
          <div><p className="text-sm text-gray-500">Pickup</p><p className="mt-1 font-semibold text-gray-900">{formatMoney(snapshot.totals.pickupSales)}</p></div>
          <div><p className="text-sm text-gray-500">Contra entrega</p><p className="mt-1 font-semibold text-gray-900">{formatMoney(snapshot.totals.cashOnDeliverySales)}</p></div>
          <div><p className="text-sm text-gray-500">Efectivo en tienda</p><p className="mt-1 font-semibold text-gray-900">{formatMoney(snapshot.totals.cashAtStoreSales)}</p></div>
          <div><p className="text-sm text-gray-500">Neto Stripe</p><p className="mt-1 font-semibold text-gray-900">{formatMoney(snapshot.totals.stripeNetAmount)}</p></div>
          <div><p className="text-sm text-gray-500">Neto tienda</p><p className="mt-1 font-semibold text-gray-900">{formatMoney(snapshot.totals.storeNetTotal)}</p></div>
          <div><p className="text-sm text-gray-500">Neto ElMenu</p><p className="mt-1 font-semibold text-gray-900">{formatMoney(snapshot.totals.platformNetTotal)}</p></div>
          <div><p className="text-sm text-gray-500">Pedidos del dia</p><p className="mt-1 font-semibold text-gray-900">{snapshot.totals.orders}</p></div>
        </div>
      </div>

      <MetricsTable title="Corte por tienda" rows={snapshot.byStore} />
      <MetricsTable title="Corte por repartidor" rows={snapshot.byDriver} />

      <div className="rounded-lg border bg-white shadow-sm">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold text-gray-900">Pedidos del dia</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Pago</th>
                <th className="px-4 py-3">Quien cobro</th>
                <th className="px-4 py-3">Subtotal</th>
                <th className="px-4 py-3">Envio</th>
                <th className="px-4 py-3">Comision ElMenu</th>
                <th className="px-4 py-3">Stripe</th>
                <th className="px-4 py-3">Pago repartidor</th>
                <th className="px-4 py-3">Total cliente</th>
                <th className="px-4 py-3">Neto tienda</th>
                <th className="px-4 py-3">Neto ElMenu</th>
                <th className="px-4 py-3">Liquidacion</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.orders.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-6 text-center text-gray-500">No hay pedidos para este dia.</td>
                </tr>
              ) : (
                snapshot.orders.map((order) => (
                  <tr key={order._id} className="border-t">
                    <td className="px-4 py-3 font-medium text-gray-900">{order.orderNumber}</td>
                    <td className="px-4 py-3 text-gray-700">{order.orderType}</td>
                    <td className="px-4 py-3 text-gray-700">{order.paymentMethodLabel} / {order.paymentProviderLabel}</td>
                    <td className="px-4 py-3 text-gray-700">{order.cashCollectedBy}</td>
                    <td className="px-4 py-3 text-gray-700">{formatMoney(order.productsSubtotal || 0)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatMoney(order.shippingFee || 0)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatMoney(order.platformCommission || 0)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatMoney(order.stripeFee || 0)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatMoney(order.driverPayout || 0)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatMoney(order.grossTotal || 0)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatMoney(order.storeNetTotal || 0)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatMoney(order.platformNetTotal || 0)}</td>
                    <td className="px-4 py-3 text-gray-700">{order.settlementStatus}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
