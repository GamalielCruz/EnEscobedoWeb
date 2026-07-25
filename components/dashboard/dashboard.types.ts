"use client";

import type { Order } from "@/hooks/useOrderNotifications";

export type SectionKey =
  | "inicio"
  | "pedidos"
  | "productos"
  | "mi-tienda"
  | "solicitudes";

export type StoreServiceTypes = {
  delivery?: boolean;
  pickup?: boolean;
  deliveryRadius?: number;
  minimumOrderDelivery?: number;
  onDemand?: boolean;
  onDemandExtraMinutes?: number;
};

export type OwnedStore = {
  _id: string;
  name: string;
  storeId?: string;
};

export type CategoryOption = {
  _id: string;
  title: string;
};

export type CategoryOrdering = string[];

export type ProductOption = {
  _key: string;
  label: string;
  description?: string;
  priceDelta: number;
  isDefault: boolean;
};

export type ProductOptionGroup = {
  _key: string;
  title: string;
  description?: string;
  required: boolean;
  selectionType: "single" | "multiple";
  options: ProductOption[];
};

export type Product = {
  _id: string;
  name: string;
  slug?: string;
  price: number;
  stock?: number;
  description?: any;
  image?: { _ref?: string } | null;
  categories?: Array<{ _id: string; title: string }>;
  optionGroups?: ProductOptionGroup[];
  approvalStatus?: "pending" | "approved" | "rejected";
  isVisible?: boolean;
  pendingChanges?: Record<string, unknown>;
  rejectionReason?: string;
};

export type ProductOrdering = {
  all: string[];
  categories: Record<string, string[]>;
};

export type ProductFormState = {
  name: string;
  price: string;
  description: string;
  stock: string;
  image: { _type: string; asset: { _type: string; _ref: string } } | null;
  categories: string[];
  optionGroups: ProductOptionGroup[];
};

export type StoreAddress = {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type StoreContact = {
  phone?: string;
  email?: string;
  manager?: string;
};

export type StoreOperatingHours = {
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
  saturday?: string;
  sunday?: string;
};

export type StoreConfig = {
  _id: string;
  name?: string;
  isOpen?: boolean;
  manualOperationalStatus?: "open" | "closed" | "auto";
  highDemandMode?: boolean;
  hasOwnDelivery?: boolean;
  platformCommissionPercent?: number;
  coordinates?: { latitude?: number; longitude?: number };
  serviceTypes?: StoreServiceTypes;
  contact?: StoreContact;
  address?: StoreAddress;
  operatingHours?: StoreOperatingHours;
  deliveryTimeMin?: number;
  deliveryTimeMax?: number;
};

export type StoreSettingsDraft = {
  name: string;
  isOpen: boolean;
  manualOperationalStatus: "open" | "closed" | "auto";
  highDemandMode: boolean;
  contact: Required<StoreContact>;
  address: Required<StoreAddress>;
  operatingHours: Required<StoreOperatingHours>;
  serviceTypes: Required<StoreServiceTypes>;
};

export type ProductRequest = {
  _id: string;
  product?: { _id: string; name?: string; affiliateStore?: { _id: string; name: string } } | null;
  submittedBy?: string;
  submittedAt?: string;
  status?: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  changes?: {
    name?: string;
    price?: number;
    stock?: number;
    description?: any;
    image?: unknown;
    categories?: any[];
    optionGroups?: any[];
  } | null;
};

export type StoreRequest = {
  _id: string;
  store: { _id: string; name: string };
  submittedBy?: string;
  submittedAt?: string;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  changes?: Record<string, unknown>;
};

export type DashboardMetric = {
  key: string;
  label: string;
  value: string;
  hint: string;
};

export type OrderViewKey = "activos" | "hoy" | "historial";

export type OrderFilterState = {
  type: "all" | "home_delivery" | "click_collect";
  status: string;
};

export type OrderQuickAction = {
  label: string;
  status: string;
  variant?: "primary" | "secondary" | "destructive";
};

export type DashboardOrder = Order;
