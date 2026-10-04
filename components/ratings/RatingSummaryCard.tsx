import Image from "next/image";
import { Star } from "lucide-react";
import type { RatingSummary } from "@/lib/order-ratings";

const NAVY = "#09193B";
const BRAND = "#EB1901";

export type ReceivedRating = {
  rating?: number | null;
  createdAt?: string | null;
  orderNumber?: string | null;
  evaluatorRole?: string | null;
};

const dateFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function dateLabel(iso?: string | null): string {
  const ms = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(ms) ? dateFmt.format(ms) : "—";
}

/** 3 estrellas llenas hasta `value` (para mostrar una calificación 1-3). */
function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center" aria-hidden>
      {[1, 2, 3].map((level) => (
        <Star
          key={level}
          style={{ width: size, height: size, color: level <= value ? BRAND : "#D8DCE3" }}
          fill={level <= value ? BRAND : "none"}
          strokeWidth={level <= value ? 2 : 1.8}
        />
      ))}
    </span>
  );
}

/**
 * Tarjeta de reputación: promedio de calificaciones recibidas (1-3), cuántas
 * son, su distribución y las más recientes. Presentacional y compartida por el
 * perfil del repartidor y el del cliente.
 */
export function RatingSummaryCard({
  name,
  subtitle,
  imageUrl,
  summary,
  recent,
}: {
  name: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  summary: RatingSummary;
  recent: ReceivedRating[];
}) {
  const { average, count, distribution } = summary;

  return (
    <div className="space-y-3">
      {/* Cabecera: identidad + promedio */}
      <div className="flex items-center gap-4 border-2 border-gray-200 p-4">
        {imageUrl ? (
          <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-gray-100">
            <Image src={imageUrl} alt={name} fill className="object-cover" />
          </span>
        ) : (
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-black text-white"
            style={{ backgroundColor: NAVY }}
          >
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-black" style={{ color: NAVY }}>
            {name}
          </p>
          {subtitle ? (
            <p className="mt-0.5 truncate text-xs font-semibold text-gray-500">{subtitle}</p>
          ) : null}
          <div className="mt-1.5 flex items-center gap-2">
            <Stars value={average ? Math.round(average) : 0} />
            <span className="text-sm font-black tabular-nums" style={{ color: NAVY }}>
              {average == null ? "Sin evaluaciones" : `${average.toFixed(1)} / 3`}
            </span>
          </div>
        </div>
      </div>

      <p className="text-xs font-medium text-gray-500">
        {count === 1 ? "1 evaluación recibida" : `${count} evaluaciones recibidas`}
      </p>

      {/* Distribución */}
      <div className="space-y-1.5 border-2 border-gray-200 p-4">
        {[3, 2, 1].map((level) => {
          const value = distribution[level as 1 | 2 | 3] ?? 0;
          const pct = count > 0 ? (value / count) * 100 : 0;
          return (
            <div key={level} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-[11px] font-bold text-gray-500">{level} ★</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: BRAND }} />
              </span>
              <span className="w-6 shrink-0 text-right text-[11px] font-bold tabular-nums text-gray-500">
                {value}
              </span>
            </div>
          );
        })}
      </div>

      {/* Recientes */}
      <h3 className="pt-1 text-xs font-bold uppercase tracking-wide text-gray-500">
        Evaluaciones recientes
      </h3>
      {recent.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 p-5 text-center">
          <p className="text-sm font-bold" style={{ color: NAVY }}>
            Aún no tienes evaluaciones
          </p>
          <p className="mt-1 text-xs font-medium text-gray-500">
            Cuando alguien califique un servicio, aparecerá aquí.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100">
          {recent.map((row, index) => {
            const level = Number(row.rating);
            return (
              <li key={`${row.orderNumber ?? index}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="min-w-0">
                  <Stars value={Number.isInteger(level) ? level : 0} size={14} />
                  <span className="mt-0.5 block truncate text-[11px] font-medium text-gray-400">
                    {row.orderNumber ? `Pedido #${row.orderNumber} · ` : ""}
                    {dateLabel(row.createdAt)}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-black tabular-nums" style={{ color: NAVY }}>
                  {Number.isInteger(level) ? `${level}/3` : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
