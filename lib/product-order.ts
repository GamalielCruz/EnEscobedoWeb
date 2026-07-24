export function orderProducts<T extends { _id: string }>(
  products: readonly T[],
  preferredIds: readonly string[]
) {
  const positions = new Map<string, number>();
  preferredIds.forEach((id, index) => {
    if (!positions.has(id)) positions.set(id, index);
  });

  return products
    .map((product, index) => ({ product, index }))
    .sort((a, b) => {
      const aPosition = positions.get(a.product._id);
      const bPosition = positions.get(b.product._id);
      if (aPosition == null && bPosition == null) return a.index - b.index;
      if (aPosition == null) return 1;
      if (bPosition == null) return -1;
      return aPosition - bPosition;
    })
    .map(({ product }) => product);
}

export function isCompleteOrder(
  availableIds: readonly string[],
  orderedIds: readonly string[]
) {
  if (availableIds.length !== orderedIds.length) return false;
  const ordered = new Set(orderedIds);
  return ordered.size === orderedIds.length && availableIds.every((id) => ordered.has(id));
}
