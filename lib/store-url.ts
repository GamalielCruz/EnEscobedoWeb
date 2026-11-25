type StoreUrlSource = {
  _id?: string | null;
  name?: string | null;
  slug?: { current?: string | null } | null;
};

export function slugifyStoreName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function getStoreSlug(store: StoreUrlSource) {
  return store.slug?.current?.trim() || slugifyStoreName(store.name || "") || store._id || "";
}

export function getStorePath(store: StoreUrlSource) {
  return `/${getStoreSlug(store)}`;
}
