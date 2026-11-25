"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";

interface Product {
  _id: string;
  name?: string;
  hasImage: boolean;
  categories?: Array<{ _id: string; title?: string; name?: string }>;
}

type Status = "pending" | "running" | "done" | "error" | "skipped";

interface ProductRow extends Product {
  status: Status;
  error?: string;
  imageUrl?: string;
}

const CONCURRENCY = 2;

async function fetchProducts(): Promise<Product[]> {
  const res = await fetch("/api/admin/bulk-images-list");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function processProduct(
  product: ProductRow
): Promise<{ imageUrl: string }> {
  const categoryName =
    product.categories?.[0]?.title ||
    product.categories?.[0]?.name ||
    undefined;

  const res = await fetch("/api/admin/bulk-upload-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productId: product._id,
      productName: product.name,
      categoryName,
    }),
  });

  const data = await res.json() as { ok?: boolean; error?: string; imageUrl?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return { imageUrl: data.imageUrl ?? "" };
}

export default function BulkImagesPage() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [errors, setErrors] = useState(0);
  const abortRef = useRef(false);

  useEffect(() => {
    fetchProducts()
      .then((products) =>
        setRows(
          products.map((p) => ({
            ...p,
            status: p.hasImage ? "skipped" : "pending",
          }))
        )
      )
      .catch((e: unknown) => alert("Error: " + (e instanceof Error ? e.message : String(e))))
      .finally(() => setLoading(false));
  }, []);

  const pending = rows.filter((r) => r.status === "pending");

  const updateRow = (id: string, patch: Partial<ProductRow>) =>
    setRows((prev) =>
      prev.map((r) => (r._id === id ? { ...r, ...patch } : r))
    );

  const runBatch = async (includeErrors = false) => {
    abortRef.current = false;
    setRunning(true);
    setProcessed(0);
    setErrors(0);

    const queue = rows.filter(
      (r) => r.status === "pending" || (includeErrors && r.status === "error")
    );
    // Reset error rows to pending so they show as running
    if (includeErrors) {
      setRows((prev) =>
        prev.map((r) => (r.status === "error" ? { ...r, status: "pending" } : r))
      );
    }
    let idx = 0;

    const worker = async () => {
      while (idx < queue.length && !abortRef.current) {
        const product = queue[idx++];
        updateRow(product._id, { status: "running" });
        try {
          const { imageUrl } = await processProduct(product);
          updateRow(product._id, { status: "done", imageUrl });
          setProcessed((n) => n + 1);
        } catch (e) {
          updateRow(product._id, {
            status: "error",
            error: e instanceof Error ? e.message : String(e),
          });
          setErrors((n) => n + 1);
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRunning(false);
  };

  const statusIcon: Record<Status, string> = {
    pending: "⬜",
    running: "⏳",
    done: "✅",
    error: "❌",
    skipped: "🔵",
  };

  const totalPending = pending.length;
  const total = rows.length;

  if (loading)
    return <div className="p-8 text-gray-500">Cargando productos...</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Imágenes en bulk — Abarrotes</h1>
      <p className="text-sm text-gray-500 mb-6">
        Busca y sube imágenes desde Open Food Facts a Sanity para cada producto
        sin imagen. {CONCURRENCY} en paralelo.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6 text-center">
        {[
          { label: "Total", value: total, cls: "bg-gray-100 text-gray-800" },
          { label: "Sin imagen", value: totalPending, cls: "bg-orange-50 text-orange-700" },
          { label: "Subidos", value: processed, cls: "bg-green-50 text-green-700" },
          { label: "Sin match", value: errors, cls: "bg-red-50 text-red-700" },
        ].map(({ label, value, cls }) => (
          <div key={label} className={`rounded-xl p-3 ${cls}`}>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Progress */}
      {running && totalPending > 0 && (
        <div className="mb-5">
          <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full bg-[#c0392b] transition-all duration-300"
              style={{
                width: `${((processed + errors) / totalPending) * 100}%`,
              }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {processed + errors} / {totalPending}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        <button
          type="button"
          onClick={() => runBatch(false)}
          disabled={running || totalPending === 0}
          className="rounded-lg bg-[#c0392b] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 hover:bg-[#a93226] transition-colors"
        >
          {running
            ? `Procesando... (${processed + errors}/${totalPending})`
            : `Generar ${totalPending} imágenes`}
        </button>
        {!running && errors > 0 && (
          <button
            type="button"
            onClick={() => runBatch(true)}
            className="rounded-lg border border-orange-300 bg-orange-50 px-5 py-2.5 text-sm font-semibold text-orange-700 hover:bg-orange-100 transition-colors"
          >
            Reintentar {errors} sin match
          </button>
        )}
        {running && (
          <button
            type="button"
            onClick={() => { abortRef.current = true; }}
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Detener
          </button>
        )}
      </div>

      {/* Product list */}
      <div className="border rounded-xl overflow-hidden text-sm">
        <div className="grid grid-cols-[2rem_2.5rem_1fr_5rem] bg-gray-50 px-4 py-2 font-semibold text-gray-500 text-xs uppercase tracking-wide gap-2">
          <span />
          <span />
          <span>Producto</span>
          <span className="text-right">Estado</span>
        </div>
        <div className="divide-y max-h-[55vh] overflow-y-auto">
          {rows.map((row) => (
            <div
              key={row._id}
              className="grid grid-cols-[2rem_2.5rem_1fr_5rem] items-center px-4 py-2 gap-2"
            >
              <span className="text-base">{statusIcon[row.status]}</span>

              {/* Thumbnail */}
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md bg-gray-100">
                {row.imageUrl ? (
                  <Image
                    src={row.imageUrl}
                    alt={row.name ?? ""}
                    width={36}
                    height={36}
                    className="h-full w-full object-contain"
                    unoptimized
                  />
                ) : null}
              </span>

              <span className="truncate text-gray-800">
                {row.name || row._id}
              </span>

              <span className="text-right text-xs text-gray-400 truncate">
                {row.status === "error" ? (
                  <span className="text-red-500 text-[10px]" title={row.error}>
                    sin match
                  </span>
                ) : (
                  row.status
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        🔵 Ya tiene imagen &nbsp;·&nbsp; ⬜ Pendiente &nbsp;·&nbsp; ⏳
        Procesando &nbsp;·&nbsp; ✅ Subido &nbsp;·&nbsp; ❌ Sin match en OFF
      </p>
    </div>
  );
}
