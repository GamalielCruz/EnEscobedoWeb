"use client";

import { BarChart3, CircleDollarSign, Package, ShoppingBag } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    accent: "bg-orange-100 text-[#eb1902]",
  },
  {
    key: "revenueToday",
    label: "Ingresos del dia",
    icon: CircleDollarSign,
    accent: "bg-green-100 text-green-700",
  },
  {
    key: "pendingOrders",
    label: "Pedidos pendientes",
    icon: BarChart3,
    accent: "bg-blue-100 text-blue-700",
  },
  {
    key: "activeProducts",
    label: "Productos activos",
    icon: Package,
    accent: "bg-purple-100 text-purple-700",
  },
] as const;

export function DashboardMetrics({ metrics }: DashboardMetricsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metricConfig.map((metric) => {
        const Icon = metric.icon;
        const rawValue = metrics[metric.key];
        const formattedValue =
          metric.key === "revenueToday" ? formatCurrency(Number(rawValue || 0)) : String(rawValue ?? 0);

        return (
          <Card key={metric.key} className="border-gray-200 bg-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-semibold text-gray-600">{metric.label}</CardTitle>
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${metric.accent}`}>
                <Icon className="h-5 w-5" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-900">{formattedValue}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
