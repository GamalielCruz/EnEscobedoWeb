"use client";

import * as React from "react";
import { useUser } from "@clerk/nextjs";

import { useOrderNotifications } from "@/hooks/useOrderNotifications";

import { finalStatuses } from "./dashboard.constants";
import type {
  CategoryOption,
  OwnedStore,
  Product,
  ProductFormState,
  ProductRequest,
  StoreConfig,
  StoreRequest,
} from "./dashboard.types";

type StoreImageAsset = { _type: string; asset: { _type: string; _ref: string } };

type SubmitProductPayload = {
  editingProductId: string | null;
  formState: ProductFormState;
};

export function useDashboardData() {
  const { user, isLoaded } = useUser();
  const [ownedStores, setOwnedStores] = React.useState<OwnedStore[]>([]);
  const [selectedStoreId, setSelectedStoreId] = React.useState<string | null>(null);
  const [loadingStores, setLoadingStores] = React.useState(true);
  const [availableStores, setAvailableStores] = React.useState<OwnedStore[]>([]);
  const [loadingAvailableStores, setLoadingAvailableStores] = React.useState(false);
  const [claimingStoreId, setClaimingStoreId] = React.useState<string | null>(null);

  const [products, setProducts] = React.useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = React.useState(false);
  const [refreshingProducts, setRefreshingProducts] = React.useState(false);
  const [availableCategories, setAvailableCategories] = React.useState<CategoryOption[]>([]);

  const [storeConfig, setStoreConfig] = React.useState<StoreConfig | null>(null);
  const [storeConfigLoading, setStoreConfigLoading] = React.useState(false);
  const [savingStoreConfig, setSavingStoreConfig] = React.useState(false);
  const [submittingStoreRequest, setSubmittingStoreRequest] = React.useState(false);

  const [productRequests, setProductRequests] = React.useState<ProductRequest[]>([]);
  const [storeRequests, setStoreRequests] = React.useState<StoreRequest[]>([]);

  const selectedStore = React.useMemo(
    () => ownedStores.find((store) => store._id === selectedStoreId) ?? null,
    [ownedStores, selectedStoreId]
  );

  const todayOrdersHook = useOrderNotifications({
    storeId: selectedStoreId,
    enabled: Boolean(selectedStoreId),
    queryParams: { scope: "today" },
  });

  const historyOrdersHook = useOrderNotifications({
    storeId: selectedStoreId,
    enabled: Boolean(selectedStoreId),
    queryParams: { scope: "history" },
  });

  const activeOrders = React.useMemo(
    () => todayOrdersHook.orders.filter((order) => !finalStatuses.includes(order.status)),
    [todayOrdersHook.orders]
  );

  const metrics = React.useMemo(() => {
    const validRevenueStatuses = todayOrdersHook.orders.filter(
      (order) => order.status !== "cancelled" && order.status !== "failed"
    );

    return {
      ordersToday: todayOrdersHook.orders.length,
      revenueToday: validRevenueStatuses.reduce((sum, order) => sum + (order.totalAmount || 0), 0),
      pendingOrders: activeOrders.length,
      activeProducts: products.filter(
        (product) => product.approvalStatus !== "rejected" && product.isVisible !== false
      ).length,
    };
  }, [todayOrdersHook.orders, activeOrders.length, products]);

  const pendingChanges = React.useMemo(
    () =>
      productRequests.reduce<Record<string, boolean>>((acc, request) => {
        if (request.status === "pending" && request.product?._id) {
          acc[request.product._id] = true;
        }
        return acc;
      }, {}),
    [productRequests]
  );

  const refreshOwnedStores = React.useCallback(async () => {
    if (!user) {
      setOwnedStores([]);
      setSelectedStoreId(null);
      setLoadingStores(false);
      return;
    }

    setLoadingStores(true);
    try {
      const response = await fetch("/api/my-stores", { cache: "no-store" });
      const data = await response.json();
      const stores = (data.stores || []) as OwnedStore[];
      setOwnedStores(stores);
      setSelectedStoreId((current) => {
        if (current && stores.some((store) => store._id === current)) return current;
        return stores[0]?._id || null;
      });
    } finally {
      setLoadingStores(false);
    }
  }, [user]);

  const refreshAvailableStores = React.useCallback(async () => {
    setLoadingAvailableStores(true);
    try {
      const response = await fetch("/api/dashboard/all-stores", { cache: "no-store" });
      const data = await response.json();
      setAvailableStores(data.stores || []);
    } finally {
      setLoadingAvailableStores(false);
    }
  }, []);

  const claimStore = React.useCallback(
    async (storeId: string) => {
      setClaimingStoreId(storeId);
      try {
        const response = await fetch("/api/dashboard/claim-store", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId }),
        });
        const data = await response.json();
        if (!data.success) return false;
        await refreshOwnedStores();
        return true;
      } finally {
        setClaimingStoreId(null);
      }
    },
    [refreshOwnedStores]
  );

  const refreshProducts = React.useCallback(
    async (background = false) => {
      if (!selectedStoreId) {
        setProducts([]);
        return;
      }

      if (background) {
        setRefreshingProducts(true);
      } else {
        setProductsLoading(true);
      }

      try {
        const response = await fetch(`/api/dashboard/store-products?storeId=${selectedStoreId}`, {
          cache: "no-store",
        });
        const data = await response.json();
        setProducts(data.products || []);
      } finally {
        setProductsLoading(false);
        setRefreshingProducts(false);
      }
    },
    [selectedStoreId]
  );

  const loadCategories = React.useCallback(async () => {
    if (availableCategories.length > 0) return;
    const response = await fetch("/api/dashboard/categories", { cache: "no-store" });
    const data = await response.json();
    setAvailableCategories(data.categories || []);
  }, [availableCategories.length]);

  const refreshStoreConfig = React.useCallback(async () => {
    if (!selectedStoreId) {
      setStoreConfig(null);
      return;
    }

    setStoreConfigLoading(true);
    try {
      const response = await fetch(`/api/dashboard/store-config?storeId=${selectedStoreId}`, {
        cache: "no-store",
      });
      const data = await response.json();
      setStoreConfig(data.store || null);
    } finally {
      setStoreConfigLoading(false);
    }
  }, [selectedStoreId]);

  const refreshRequests = React.useCallback(async () => {
    if (!selectedStoreId) {
      setProductRequests([]);
      setStoreRequests([]);
      return;
    }

    const [productRes, storeRes] = await Promise.all([
      fetch(
        `/api/dashboard/product-update-requests?storeId=${selectedStoreId}&status=pending,approved,rejected`,
        { cache: "no-store" }
      ),
      fetch(`/api/dashboard/store-update-requests?storeId=${selectedStoreId}&status=pending,approved,rejected`, {
        cache: "no-store",
      }),
    ]);

    const [productData, storeData] = await Promise.all([productRes.json(), storeRes.json()]);
    setProductRequests(productData.items || []);
    setStoreRequests(storeData.items || []);
  }, [selectedStoreId]);

  const saveStoreConfig = React.useCallback(
    async (payload: {
      serviceTypes?: StoreConfig["serviceTypes"];
      isOpen?: boolean;
      highDemandMode?: boolean;
    }) => {
      if (!selectedStoreId) return false;
      setSavingStoreConfig(true);
      try {
        const response = await fetch("/api/dashboard/store-config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId: selectedStoreId, ...payload }),
        });
        const data = await response.json();
        if (!data.success) return false;
        await refreshStoreConfig();
        return true;
      } finally {
        setSavingStoreConfig(false);
      }
    },
    [selectedStoreId, refreshStoreConfig]
  );

  const updateOrderStatus = React.useCallback(
    async (orderId: string, orderNumber: string, status: string) => {
      todayOrdersHook.updateOrderLocally(orderId, { status });
      historyOrdersHook.updateOrderLocally(orderId, { status });

      const response = await fetch("/api/dashboard/store-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber, status }),
      });

      if (!response.ok) {
        await todayOrdersHook.refresh();
        await historyOrdersHook.refresh();
      } else {
        todayOrdersHook.refresh();
        historyOrdersHook.refresh();
      }
    },
    [todayOrdersHook, historyOrdersHook]
  );

  const uploadProductImage = React.useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/dashboard/upload-image", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    return (data.asset as StoreImageAsset) || null;
  }, []);

  const submitProduct = React.useCallback(
    async ({ editingProductId, formState }: SubmitProductPayload) => {
      if (!selectedStoreId || !formState.name.trim() || !formState.price) return false;

      const descriptionBlocks = formState.description.trim()
        ? [
            {
              _type: "block",
              _key: `desc-${Date.now()}`,
              style: "normal",
              children: [{ _type: "span", _key: "span", text: formState.description.trim() }],
              markDefs: [],
            },
          ]
        : undefined;

      if (editingProductId) {
        const changes: Record<string, unknown> = {};
        if (formState.name.trim()) changes.name = formState.name.trim();
        if (formState.price) changes.price = Number(formState.price);
        if (formState.stock) changes.stock = Number(formState.stock);
        if (descriptionBlocks) changes.description = descriptionBlocks;
        if (formState.image) changes.image = formState.image;
        if (formState.categories.length > 0) {
          changes.categories = formState.categories.map((categoryId) => ({
            _type: "reference",
            _ref: categoryId,
          }));
        }
        if (formState.optionGroups.length > 0) {
          changes.optionGroups = formState.optionGroups;
        }

        const response = await fetch("/api/dashboard/product-update-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: editingProductId, changes }),
        });
        const data = await response.json();
        if (!data.success) return false;
      } else {
        const response = await fetch("/api/dashboard/store-products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeId: selectedStoreId,
            name: formState.name.trim(),
            price: Number(formState.price),
            description: formState.description.trim() || undefined,
            stock: formState.stock ? Number(formState.stock) : undefined,
            image: formState.image,
            categories: formState.categories.length > 0 ? formState.categories : undefined,
            optionGroups: formState.optionGroups.length > 0 ? formState.optionGroups : undefined,
          }),
        });
        const data = await response.json();
        if (!data.success) return false;
      }

      await Promise.all([refreshProducts(true), refreshRequests()]);
      return true;
    },
    [selectedStoreId, refreshProducts, refreshRequests]
  );

  const submitStoreChanges = React.useCallback(
    async (changes: Record<string, unknown>) => {
      if (!selectedStoreId || Object.keys(changes).length === 0) return false;
      setSubmittingStoreRequest(true);
      try {
        const response = await fetch("/api/dashboard/store-update-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId: selectedStoreId, changes }),
        });
        const data = await response.json();
        if (!data.success) return false;
        await refreshRequests();
        return true;
      } finally {
        setSubmittingStoreRequest(false);
      }
    },
    [selectedStoreId, refreshRequests]
  );

  React.useEffect(() => {
    if (isLoaded) {
      refreshOwnedStores();
    }
  }, [isLoaded, refreshOwnedStores]);

  React.useEffect(() => {
    if (!loadingStores && ownedStores.length === 0 && user) {
      refreshAvailableStores();
    }
  }, [loadingStores, ownedStores.length, refreshAvailableStores, user]);

  React.useEffect(() => {
    if (!selectedStoreId) return;
    refreshProducts();
    refreshStoreConfig();
    refreshRequests();
  }, [selectedStoreId, refreshProducts, refreshStoreConfig, refreshRequests]);

  return {
    isLoaded,
    user,
    loadingStores,
    ownedStores,
    availableStores,
    loadingAvailableStores,
    claimingStoreId,
    selectedStoreId,
    setSelectedStoreId,
    selectedStore,
    storeConfig,
    storeConfigLoading,
    savingStoreConfig,
    submittingStoreRequest,
    products,
    productsLoading,
    refreshingProducts,
    availableCategories,
    activeOrders,
    todayOrders: todayOrdersHook.orders,
    historyOrders: historyOrdersHook.orders,
    todayOrdersLoading: todayOrdersHook.isLoading,
    historyOrdersLoading: historyOrdersHook.isLoading,
    todayLastUpdate: todayOrdersHook.lastUpdate,
    historyLastUpdate: historyOrdersHook.lastUpdate,
    productRequests,
    storeRequests,
    pendingChanges,
    metrics,
    refreshOwnedStores,
    refreshAvailableStores,
    claimStore,
    refreshProducts: () => refreshProducts(true),
    loadCategories,
    saveStoreConfig,
    updateOrderStatus,
    uploadProductImage,
    submitProduct,
    submitStoreChanges,
    refreshRequests,
    refreshActiveOrders: todayOrdersHook.refresh,
    refreshTodayOrders: todayOrdersHook.refresh,
    refreshHistoryOrders: historyOrdersHook.refresh,
  };
}
