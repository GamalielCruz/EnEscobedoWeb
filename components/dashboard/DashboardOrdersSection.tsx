"use client";

import * as React from "react";
import { Filter, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { statusConfig } from "./dashboard.constants";
import { OrderCard } from "./OrderCard";
import type { DashboardOrder, OrderFilterState, OrderViewKey } from "./dashboard.types";

type DashboardOrdersSectionProps = {
  activeOrders: DashboardOrder[];
  todayOrders: DashboardOrder[];
  historyOrders: DashboardOrder[];
  currentOrdersLoading: boolean;
  currentLastUpdate: Date | null;
  updatingOrderNumber: string | null;
  onRefreshActiveOrders: () => void;
  onRefreshTodayOrders: () => void;
  onRefreshHistoryOrders: () => void;
  onUpdateOrderStatus: (orderId: string, orderNumber: string, status: string) => void;
};

export function DashboardOrdersSection({
  activeOrders,
  todayOrders,
  historyOrders,
  currentOrdersLoading,
  currentLastUpdate,
  updatingOrderNumber,
  onRefreshActiveOrders,
  onRefreshTodayOrders,
  onRefreshHistoryOrders,
  onUpdateOrderStatus,
}: DashboardOrdersSectionProps) {
  const [view, setView] = React.useState<OrderViewKey>("activos");
  const [filters, setFilters] = React.useState<OrderFilterState>({ type: "all", status: "all" });

  const sourceOrders =
    view === "activos" ? activeOrders : view === "hoy" ? todayOrders : historyOrders;

  const filteredOrders = React.useMemo(
    () =>
      sourceOrders.filter((order) => {
        const matchesType = filters.type === "all" || order.deliveryMethod === filters.type;
        const matchesStatus = filters.status === "all" || order.status === filters.status;
        return matchesType && matchesStatus;
      }),
    [sourceOrders, filters]
  );

  const refreshCurrent =
    view === "activos"
      ? onRefreshActiveOrders
      : view === "hoy"
        ? onRefreshTodayOrders
        : onRefreshHistoryOrders;

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Pedidos</CardTitle>
            <CardDescription>
              Monitorea pedidos activos, del dia e historicos con filtros rapidos.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-500">
            {currentLastUpdate ? (
              <span>Actualizado: {currentLastUpdate.toLocaleTimeString()}</span>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={refreshCurrent}>
              <RefreshCw className={`h-4 w-4 ${currentOrdersLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <Tabs value={view} onValueChange={(value) => setView(value as OrderViewKey)}>
            <TabsList className="grid w-full grid-cols-3 md:w-[420px]">
              <TabsTrigger value="activos">Activos</TabsTrigger>
              <TabsTrigger value="hoy">Hoy</TabsTrigger>
              <TabsTrigger value="historial">Historial</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Filter className="h-4 w-4" />
              <span>Filtros</span>
            </div>
            <Select
              value={filters.type}
              onValueChange={(value: OrderFilterState["type"]) =>
                setFilters((current) => ({ ...current, type: value }))
              }
            >
              <SelectTrigger className="w-full sm:w-[180px] bg-white">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="home_delivery">Delivery</SelectItem>
                <SelectItem value="click_collect">Pickup</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.status}
              onValueChange={(value) =>
                setFilters((current) => ({ ...current, status: value }))
              }
            >
              <SelectTrigger className="w-full sm:w-[220px] bg-white">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                {Object.entries(statusConfig).map(([value, config]) => (
                  <SelectItem key={value} value={value}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-12 text-center text-gray-500">
            No hay pedidos que coincidan con los filtros actuales.
          </div>
        ) : (
          filteredOrders.map((order) => (
            <OrderCard
              key={order._id}
              order={order}
              updating={updatingOrderNumber === order.orderNumber}
              onUpdateStatus={onUpdateOrderStatus}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
