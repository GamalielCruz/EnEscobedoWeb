import { Star } from "lucide-react";
import {
  RATING_ANONYMITY_NOTE,
  reputationWindowLabel,
  type ReputationSummary,
} from "@/lib/order-ratings";

const NAVY = "#09193B";
const BRAND = "#EB1901";

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
 * Tarjeta de reputación ANÓNIMA.
 *
 * Muestra UNICAMENTE:
 *   - identidad de la persona (nombre + rol);
 *   - el promedio de una VENTANA MÓVIL de las últimas 50 evaluaciones;
 *   - un texto que aclara en cuántas entregas se basa.
 *
 * No lista evaluaciones individuales, no revela la distribución 3/2/1, no
 * identifica a quien calificó ni el pedido de origen. Esos registros siguen
 * existiendo del lado interno (moderación/análisis) pero no se exponen aquí.
 */
export function RatingSummaryCard({
  name,
  subtitle,
  summary,
}: {
  name: string;
  subtitle?: string | null;
  summary: ReputationSummary;
}) {
  const { average, count } = summary;
  const filled = average == null ? 0 : Math.round(average);

  return (
    <div className="space-y-3">
      {/* Identidad */}
      <div className="flex items-center gap-4 border-2 border-gray-200 p-4">
        {/* Inicial en lugar de avatar: no depende de hosts externos. */}
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-black text-white"
          style={{ backgroundColor: NAVY }}
          aria-hidden
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-black" style={{ color: NAVY }}>
            {name}
          </p>
          {subtitle ? (
            <p className="mt-0.5 truncate text-xs font-semibold text-gray-500">{subtitle}</p>
          ) : null}
        </div>
      </div>

      {/* Reputación: solo promedio + ventana móvil */}
      <div className="border-2 border-gray-200 p-5 text-center">
        <Stars value={filled} size={30} />
        <p className="mt-3 text-3xl font-black tabular-nums" style={{ color: NAVY }}>
          {average == null ? "—" : `${average.toFixed(1)} / 3`}
        </p>
        <p className="mt-1.5 text-sm font-semibold text-gray-600">
          {reputationWindowLabel(count)}
        </p>
      </div>

      <p className="text-[11px] leading-relaxed text-gray-400">
        {RATING_ANONYMITY_NOTE}
      </p>
    </div>
  );
}
