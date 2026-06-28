"use client";

import { BarChart3, CircleDollarSign, Package, ShoppingBag } from "lucide-react";

import {
  DashboardDescription,
  DashboardMetricValue,
  DashboardPanel,
  DashboardStatusPill,
} from "./dashboard.design";
import { formatCurrency } from "./dashboard.utils";

type DashboardMetricsProps = {
  metrics: {
    ordersToday: number;
    revenueToday: number;
    pendingOrders: number;
    activeProducts: number;
  };
};

const metricConfig = [
  {
    key: "ordersToday",
    label: "Pedidos de hoy",
    icon: ShoppingBag,
    accent: "text-gray-700",
    tone: "neutral" as const,
    helper: "Total registrados hoy",
  },
  {
    key: "revenueToday",
    label: "Ingresos del dia",
    icon: CircleDollarSign,
    accent: "text-gray-700",
    tone: "neutral" as const,
    helper: "Venta bruta estimada",
  },
  {
    key: "pendingOrders",
    label: "Requieren atencion",
    icon: BarChart3,
    accent: "text-[#850C22]",
    tone: "warning" as const,
    helper: "Activos o por preparar",
  },
  {
    key: "activeProducts",
    label: "Productos activos",
    icon: Package,
    accent: "text-[#20096F]",
    tone: "success" as const,
    helper: "Disponibles en catalogo",
  },
] as const;

export function DashboardMetrics({ metrics }: DashboardMetricsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metricConfig.map((metric) => {
        const Icon = metric.icon;
        const rawValue = metrics[metric.key];
        const formattedValue =
          metric.key === "revenueToday" ? formatCurrency(Number(rawValue || 0)) : String(rawValue ?? 0);

        return (
          <DashboardPanel key={metric.key} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                  {metric.label}
                </p>
                <DashboardMetricValue className="mt-2">{formattedValue}</DashboardMetricValue>
                <DashboardDescription className="mt-1 text-[13px]">
                  {metric.helper}
                </DashboardDescription>
              </div>
              <div className={`mt-0.5 ${metric.accent}`}>
                <Icon className="h-4.5 w-4.5" />
              </div>
            </div>
            <div className="mt-3">
              <DashboardStatusPill tone={metric.tone}>
                {metric.key === "pendingOrders"
                  ? Number(rawValue || 0) > 0
                    ? "Atencion requerida"
                    : "Sin rezago"
                  : metric.key === "revenueToday"
                    ? "Corte del dia"
                    : metric.key === "ordersToday"
                      ? "Operacion diaria"
                      : "Catalogo publicado"}
              </DashboardStatusPill>
            </div>
          </DashboardPanel>
        );
      })}
    </div>
  );
}
