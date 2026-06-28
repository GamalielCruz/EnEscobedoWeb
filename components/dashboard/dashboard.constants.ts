"use client";

import {
  Clock3,
  LayoutDashboard,
  Package,
  ShoppingBag,
  Store,
} from "lucide-react";

import type { SectionKey } from "./dashboard.types";

export const sidebarItems: Array<{
  key: SectionKey;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { key: "inicio", label: "Inicio", icon: LayoutDashboard },
  { key: "pedidos", label: "Pedidos", icon: ShoppingBag },
  { key: "productos", label: "Productos", icon: Package },
  { key: "mi-tienda", label: "Mi Tienda", icon: Store },
  { key: "solicitudes", label: "Solicitudes", icon: Clock3 },
];

export const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendiente", color: "bg-yellow-100 text-yellow-800" },
  paid: { label: "Pagado", color: "bg-blue-100 text-blue-800" },
  pending_delivery: { label: "Pendiente entrega", color: "bg-yellow-100 text-yellow-800" },
  pending_pickup: { label: "Pendiente de recoger", color: "bg-yellow-100 text-yellow-800" },
  processing: { label: "Preparando", color: "bg-blue-100 text-blue-800" },
  shipped: { label: "En camino", color: "bg-indigo-100 text-indigo-800" },
  ready_for_pickup: { label: "Listo para recoger", color: "bg-green-100 text-green-800" },
  completed: { label: "Completado", color: "bg-gray-100 text-gray-800" },
  delivered: { label: "Entregado", color: "bg-gray-100 text-gray-800" },
  picked_up: { label: "Recogido", color: "bg-gray-100 text-gray-800" },
  cancelled: { label: "Cancelado", color: "bg-red-100 text-red-800" },
  failed: { label: "Fallido", color: "bg-red-100 text-red-800" },
  approved: { label: "Aprobada", color: "bg-green-100 text-green-700" },
  rejected: { label: "Rechazada", color: "bg-red-100 text-red-700" },
};

export const finalStatuses = ["completed", "cancelled", "delivered", "picked_up", "failed"];

export const weekdays: Array<{ key: string; label: string }> = [
  { key: "monday", label: "Lunes" },
  { key: "tuesday", label: "Martes" },
  { key: "wednesday", label: "Miercoles" },
  { key: "thursday", label: "Jueves" },
  { key: "friday", label: "Viernes" },
  { key: "saturday", label: "Sabado" },
  { key: "sunday", label: "Domingo" },
];
