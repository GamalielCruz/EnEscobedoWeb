"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RefreshCw, Truck, Phone, Store } from "lucide-react";

type Repartidor = {
  _id: string;
  nombre: string;
  telefono: string;
  activo: boolean;
  notas?: string;
  tiendaAsignada?: {
    _id: string;
    name: string;
    storeId: string;
  } | null;
};

export default function AdminRepartidoresPage() {
  const [repartidores, setRepartidores] = useState<Repartidor[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchRepartidores() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/repartidores");
      const data = await res.json();
      if (data.success) {
        setRepartidores(data.repartidores);
      } else {
        setError(data.error ?? "Error al cargar");
      }
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRepartidores();
  }, []);

  async function toggleActivo(repartidor: Repartidor) {
    setToggling(repartidor._id);
    try {
      const res = await fetch("/api/admin/repartidores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: repartidor._id, activo: !repartidor.activo }),
      });
      const data = await res.json();
      if (data.success) {
        setRepartidores((prev) =>
          prev.map((r) =>
            r._id === repartidor._id ? { ...r, activo: !repartidor.activo } : r
          )
        );
      }
    } catch {
      console.error("Error al actualizar repartidor");
    } finally {
      setToggling(null);
    }
  }

  const activos = repartidores.filter((r) => r.activo).length;
  const inactivos = repartidores.length - activos;

  return (
    <div className="space-y-6 px-4 sm:px-0">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-[#ff8800]">
            Panel Admin
          </p>
          <h1 className="text-3xl font-bold text-gray-900">Repartidores</h1>
          <p className="mt-1 text-gray-500">
            Gestiona el estado de los repartidores registrados.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchRepartidores}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total", value: repartidores.length, color: "text-gray-900" },
          { label: "Activos", value: activos, color: "text-green-600" },
          { label: "Inactivos", value: inactivos, color: "text-red-500" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-4">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-sm text-gray-500">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Lista */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-[#ff8800]" />
            Lista de repartidores
          </CardTitle>
          <CardDescription>
            {loading ? "Cargando..." : `${repartidores.length} repartidores registrados`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          {loading && !error && (
            <div className="py-12 text-center text-gray-400">Cargando repartidores...</div>
          )}

          {!loading && !error && repartidores.length === 0 && (
            <div className="py-12 text-center text-gray-400">
              No hay repartidores registrados. Agrégalos desde el Sanity Studio.
            </div>
          )}

          {!loading && repartidores.length > 0 && (
            <div className="divide-y divide-gray-100">
              {repartidores.map((rep) => (
                <div
                  key={rep._id}
                  className="flex items-center justify-between gap-4 py-4"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{rep.nombre}</span>
                      <Badge
                        className={
                          rep.activo
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-500"
                        }
                      >
                        {rep.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" />
                        {rep.telefono}
                      </span>
                      <span className="flex items-center gap-1">
                        <Store className="h-3.5 w-3.5" />
                        {rep.tiendaAsignada?.name ?? "Comunitario"}
                      </span>
                    </div>
                    {rep.notas && (
                      <p className="text-xs text-gray-400 italic">{rep.notas}</p>
                    )}
                  </div>
                  <Button
                    variant={rep.activo ? "outline" : "default"}
                    size="sm"
                    disabled={toggling === rep._id}
                    onClick={() => toggleActivo(rep)}
                    className={
                      rep.activo
                        ? "border-red-200 text-red-600 hover:bg-red-50"
                        : "bg-[#ff8800] text-white hover:bg-[#ff8800]/90"
                    }
                  >
                    {toggling === rep._id
                      ? "..."
                      : rep.activo
                      ? "Desactivar"
                      : "Activar"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
