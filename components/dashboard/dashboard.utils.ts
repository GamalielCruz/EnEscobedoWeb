"use client";

import type { OrderItem } from "@/hooks/useOrderNotifications";

import { finalStatuses } from "./dashboard.constants";
import { getStoreOperationalState } from "@/lib/storeOperationalState";
import type {
  DashboardOrder,
  OrderQuickAction,
  ProductFormState,
  StoreConfig,
  StoreSettingsDraft,
} from "./dashboard.types";

export function getLocalDayBounds() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}

export function formatDate(value?: string) {
  if (!value) return "Sin fecha";
  return new Date(value).toLocaleString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}

export function buildAddressLabel(order: DashboardOrder) {
  const address = order.deliveryAddress;
  if (!address) return "";

  return [
    address.line1,
    address.line2,
    [address.postal_code, address.city].filter(Boolean).join(" "),
    address.state,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
}

export function extractPlainTextFromBlocks(value: any) {
  if (!Array.isArray(value)) return "";
  return value
    .flatMap((block) => block?.children ?? [])
    .map((child: { text?: string }) => child?.text ?? "")
    .join(" ")
    .trim();
}

export function createEmptyProductForm(): ProductFormState {
  return {
    name: "",
    price: "",
    description: "",
    stock: "",
    image: null,
    categories: [],
    optionGroups: [],
  };
}

export function productToFormState(product: any): ProductFormState {
  return {
    name: product?.name || "",
    price: String(product?.price ?? ""),
    description: extractPlainTextFromBlocks(product?.description),
    stock: product?.stock != null ? String(product.stock) : "",
    image: product?.image ?? null,
    categories: Array.isArray(product?.categories)
      ? product.categories.map((category: { _id: string }) => category._id)
      : [],
    optionGroups: Array.isArray(product?.optionGroups) ? product.optionGroups : [],
  };
}

export function getCustomizationTitle(custom: NonNullable<OrderItem["customizations"]>[number], item: OrderItem) {
  if (custom.title && !/^group-\d+$/.test(custom.title)) {
    return custom.title;
  }

  const match = custom.title?.match(/^group-(\d+)$/);
  const index = match ? Number(match[1]) : -1;
  const fallbackTitle = index >= 0 ? item.productOptionGroups?.[index]?.title : undefined;

  return fallbackTitle || custom.title || "Opcion";
}

export function getOrderQuickActions(order: DashboardOrder): OrderQuickAction[] {
  if (finalStatuses.includes(order.status)) {
    return [];
  }

  const actions: OrderQuickAction[] = [];

  if (order.deliveryMethod !== "home_delivery") {
    if (["pending", "pending_pickup", "processing", "paid"].includes(order.status)) {
      actions.push({ label: "Orden lista", status: "ready_for_pickup", variant: "primary" });
    }
  } else {
    if (order.status === "pending") {
      actions.push({ label: "Preparando", status: "processing", variant: "primary" });
    }

    if (order.status === "processing") {
      actions.push({ label: "En camino", status: "shipped", variant: "primary" });
    }
  }

  if (order.status === "shipped") {
    actions.push({ label: "Entregado", status: "delivered", variant: "primary" });
  }

  if (order.status === "ready_for_pickup") {
    actions.push({ label: "Marcar como recogido", status: "picked_up", variant: "primary" });
  }

  actions.push({ label: "Cancelar", status: "cancelled", variant: "destructive" });

  return actions;
}

export function buildStoreSettingsDraft(storeConfig: StoreConfig | null): StoreSettingsDraft {
  return {
    name: storeConfig?.name || "",
    isOpen: getStoreOperationalState(storeConfig).effectiveIsOpen,
    manualOperationalStatus: storeConfig?.manualOperationalStatus ?? "auto",
    highDemandMode:
      storeConfig?.highDemandMode ?? storeConfig?.serviceTypes?.onDemand ?? false,
    contact: {
      phone: storeConfig?.contact?.phone || "",
      email: storeConfig?.contact?.email || "",
      manager: storeConfig?.contact?.manager || "",
    },
    address: {
      street: storeConfig?.address?.street || "",
      city: storeConfig?.address?.city || "",
      state: storeConfig?.address?.state || "",
      postalCode: storeConfig?.address?.postalCode || "",
      country: storeConfig?.address?.country || "",
    },
    operatingHours: {
      monday: storeConfig?.operatingHours?.monday || "",
      tuesday: storeConfig?.operatingHours?.tuesday || "",
      wednesday: storeConfig?.operatingHours?.wednesday || "",
      thursday: storeConfig?.operatingHours?.thursday || "",
      friday: storeConfig?.operatingHours?.friday || "",
      saturday: storeConfig?.operatingHours?.saturday || "",
      sunday: storeConfig?.operatingHours?.sunday || "",
    },
    serviceTypes: {
      delivery: storeConfig?.serviceTypes?.delivery ?? true,
      pickup: storeConfig?.serviceTypes?.pickup ?? true,
      deliveryRadius: Number(storeConfig?.serviceTypes?.deliveryRadius ?? 10),
      minimumOrderDelivery: Number(storeConfig?.serviceTypes?.minimumOrderDelivery ?? 100),
      onDemand: storeConfig?.serviceTypes?.onDemand ?? false,
      onDemandExtraMinutes: Number(storeConfig?.serviceTypes?.onDemandExtraMinutes ?? 15),
    },
  };
}

export function buildStoreChangesPayload(original: StoreConfig | null, draft: StoreSettingsDraft) {
  const baseline = buildStoreSettingsDraft(original);
  const changes: Record<string, unknown> = {};

  if (baseline.name !== draft.name.trim()) changes.name = draft.name.trim();
  if (baseline.manualOperationalStatus !== draft.manualOperationalStatus) changes.manualOperationalStatus = draft.manualOperationalStatus;
  if (baseline.isOpen !== draft.isOpen) changes.isOpen = draft.isOpen;
  if (baseline.highDemandMode !== draft.highDemandMode) changes.highDemandMode = draft.highDemandMode;

  if (JSON.stringify(baseline.contact) !== JSON.stringify(draft.contact)) {
    changes.contact = draft.contact;
  }
  if (JSON.stringify(baseline.address) !== JSON.stringify(draft.address)) {
    changes.address = draft.address;
  }
  if (JSON.stringify(baseline.operatingHours) !== JSON.stringify(draft.operatingHours)) {
    changes.operatingHours = draft.operatingHours;
  }

  const normalizedServiceTypes = {
    ...draft.serviceTypes,
    onDemand: draft.highDemandMode,
  };
  const baselineServiceTypes = {
    ...baseline.serviceTypes,
    onDemand: baseline.highDemandMode,
  };
  if (JSON.stringify(baselineServiceTypes) !== JSON.stringify(normalizedServiceTypes)) {
    changes.serviceTypes = normalizedServiceTypes;
  }

  return changes;
}

export function getStoreStatusSummary(storeConfig: StoreConfig | null) {
  const { effectiveIsOpen, highDemandMode, canAcceptOrders } = getStoreOperationalState(storeConfig);

  if (!effectiveIsOpen) return "Tienda cerrada";
  if (!canAcceptOrders) return "No acepta pedidos";
  if (highDemandMode) return "Alta demanda";
  return "Operando";
}
