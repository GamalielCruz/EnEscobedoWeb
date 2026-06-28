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
  pending: { label: "Pendiente", color: "border border-amber-200 bg-amber-50 text-amber-800" },
  paid: { label: "Pagado", color: "border border-[#20096F]/10 bg-[#eff2ff] text-[#20096F]" },
  pending_delivery: { label: "Pendiente entrega", color: "border border-amber-200 bg-amber-50 text-amber-800" },
  pending_pickup: { label: "Pendiente de recoger", color: "border border-amber-200 bg-amber-50 text-amber-800" },
  processing: { label: "Preparando", color: "border border-[#850C22]/10 bg-[#fff3f4] text-[#850C22]" },
  shipped: { label: "En camino", color: "border border-sky-200 bg-sky-50 text-sky-800" },
  ready_for_pickup: { label: "Listo para recoger", color: "border border-[#9943ED]/10 bg-[#f6f0ff] text-[#6d33bf]" },
  completed: { label: "Completado", color: "border border-gray-200 bg-gray-50 text-gray-700" },
  delivered: { label: "Entregado", color: "border border-gray-200 bg-gray-50 text-gray-700" },
  picked_up: { label: "Recogido", color: "border border-gray-200 bg-gray-50 text-gray-700" },
  cancelled: { label: "Cancelado", color: "border border-[#EB1902]/10 bg-[#fff1ef] text-[#EB1902]" },
  failed: { label: "Fallido", color: "border border-[#EB1902]/10 bg-[#fff1ef] text-[#EB1902]" },
  approved: { label: "Aprobada", color: "border border-[#20096F]/10 bg-[#eff2ff] text-[#20096F]" },
  rejected: { label: "Rechazada", color: "border border-[#EB1902]/10 bg-[#fff1ef] text-[#EB1902]" },
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
