"use client";

import { useEffect } from "react";

import useBasketStore from "@/store/store";

type ClearBasketOnSuccessProps = {
  shouldClear: boolean;
};

export default function ClearBasketOnSuccess({
  shouldClear,
}: ClearBasketOnSuccessProps) {
  const clearBasket = useBasketStore((state) => state.clearBasket);

  useEffect(() => {
    if (shouldClear) {
      clearBasket();
    }
  }, [shouldClear, clearBasket]);

  return null;
}
