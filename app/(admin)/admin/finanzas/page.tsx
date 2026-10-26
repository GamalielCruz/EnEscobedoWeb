import { getAdminFinanceSnapshot } from "@/lib/admin-finance";
import { formatMoney } from "@/lib/mexico-time";
import { calculateSettlementBreakdown, readSettlementFromSnapshot } from "@/lib/settlements";

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
    platformServiceFee: number;
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
              <th className="px-4 py-3">Comisión ElMenu</th>
              <th className="px-4 py-3">Tarifa de servicio</th>
              <th className="px-4 py-3">Neto tienda</th>
              <th className="px-4 py-3">Pendiente liquidar</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-6 text-center text-gray-500">Sin movimientos para el dia seleccionado.</td>
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
                  <td className="px-4 py-3 text-gray-700">{formatMoney(row.platformServiceFee)}</td>
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
        <SummaryCard title="Comisión ElMenu" value={snapshot.totals.platformCommission} />
        <SummaryCard title="Tarifa de servicio" value={snapshot.totals.platformServiceFee} />
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

      {/* Detailed Financial Breakdown Section */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold text-gray-900">Desglose financiero detallado</h2>
          <p className="mt-1 text-sm text-gray-500">Comisiones de Stripe desglosadas por restaurante y repartidor</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Total pedido</th>
                <th className="px-4 py-3">Subtotal restaurante</th>
                <th className="px-4 py-3">Envío</th>
                <th className="px-4 py-3">Comisión ElMenu</th>
                <th className="px-4 py-3">Comisión procesador</th>
                <th className="px-4 py-3">Procesador %</th>
                <th className="px-4 py-3">Procesador fijo</th>
                <th className="px-4 py-3">Procesador (restaurante)</th>
                <th className="px-4 py-3">Procesador (repartidor)</th>
                <th className="px-4 py-3">Neto restaurante</th>
                <th className="px-4 py-3">Neto repartidor</th>
                <th className="px-4 py-3">Utilidad ElMenu</th>
                <th className="px-4 py-3">Snapshot v</th>
                <th className="px-4 py-3">Política</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.orders.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-4 py-6 text-center text-gray-500">No hay pedidos para este dia.</td>
                </tr>
              ) : (
                snapshot.orders.map((order) => {
                  // Use snapshot if available and valid, otherwise calculate
                  let breakdown;
                  if (order.settlementSnapshot && order.settlementSnapshot.version !== undefined && order.settlementSnapshot.version > 0) {
                    breakdown = readSettlementFromSnapshot(order.settlementSnapshot as any);
                  } else {
                    const financials = {
                      grossTotal: order.grossTotal || 0,
                      productsSubtotal: order.productsSubtotal || 0,
                      shippingFee: order.shippingFee || 0,
                      platformServiceFee: order.platformServiceFee || 0,
                      platformCommission: order.platformCommission || 0,
                      paymentProcessingFee: order.paymentProcessingFee || 0,
                      paymentProcessingFeePercentage: order.paymentProcessingFeePercentage || 0,
                      paymentProcessingFixedFee: order.paymentProcessingFixedFee || 0,
                      paymentNetAmount: order.paymentNetAmount || 0,
                      driverPayout: order.driverPayout || 0,
                      storeNetTotal: order.storeNetTotal || 0,
                      platformNetTotal: order.platformNetTotal || 0,
                    };
                    breakdown = calculateSettlementBreakdown(financials);
                  }
                  
                  const displayFee = order.settlementSnapshot?.paymentProcessingFee ?? order.paymentProcessingFee ?? 0;
                  const displayPercentage = order.settlementSnapshot?.paymentProcessingFeePercentage ?? order.paymentProcessingFeePercentage ?? 0;
                  const displayFixedFee = order.settlementSnapshot?.paymentProcessingFixedFee ?? order.paymentProcessingFixedFee ?? 0;
                  
                  return (
                    <tr key={order._id} className="border-t">
                      <td className="px-4 py-3 font-medium text-gray-900">{order.orderNumber}</td>
                      <td className="px-4 py-3 text-gray-700">{formatMoney(order.grossTotal || 0)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatMoney(order.productsSubtotal || 0)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatMoney(order.shippingFee || 0)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatMoney(order.platformCommission || 0)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatMoney(displayFee)}</td>
                      <td className="px-4 py-3 text-gray-700">{(displayPercentage * 100).toFixed(2)}%</td>
                      <td className="px-4 py-3 text-gray-700">{formatMoney(displayFixedFee)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatMoney(breakdown.restaurantProcessingFee)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatMoney(breakdown.driverProcessingFee)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatMoney(breakdown.restaurantNetAmount)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatMoney(breakdown.driverNetAmount)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatMoney(breakdown.platformNetRevenue)}</td>
                      <td className="px-4 py-3 text-gray-700 text-xs">{order.settlementSnapshot?.version ?? '-'}</td>
                      <td className="px-4 py-3 text-gray-700 text-xs">{order.settlementSnapshot?.settlementPolicy ?? '-'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                <th className="px-4 py-3">Comisión ElMenu</th>
              <th className="px-4 py-3">Tarifa de servicio</th>
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
                  <td colSpan={14} className="px-4 py-6 text-center text-gray-500">No hay pedidos para este dia.</td>
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
                    <td className="px-4 py-3 text-gray-700">{formatMoney(order.platformServiceFee || 0)}</td>
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
