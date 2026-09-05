"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

export type DriveNavPhase = "to_pickup" | "at_pickup" | "to_delivery" | "at_delivery" | "done";

type Accent = "orange" | "red" | "green" | "blue" | "gray";

const ACCENT_STYLES: Record<
  Accent,
  { iconWrap: string; title: string; chip: string; bar: string }
> = {
  orange: {
    iconWrap: "bg-orange-100 text-orange-600",
    title: "text-orange-600",
    chip: "bg-orange-50 text-orange-700",
    bar: "bg-orange-500",
  },
  red: {
    iconWrap: "bg-red-100 text-red-600",
    title: "text-red-600",
    chip: "bg-red-50 text-red-700",
    bar: "bg-red-500",
  },
  green: {
    iconWrap: "bg-green-100 text-green-600",
    title: "text-green-700",
    chip: "bg-green-50 text-green-700",
    bar: "bg-green-500",
  },
  blue: {
    iconWrap: "bg-blue-100 text-blue-600",
    title: "text-blue-600",
    chip: "bg-blue-50 text-blue-700",
    bar: "bg-blue-500",
  },
  gray: {
    iconWrap: "bg-gray-100 text-gray-600",
    title: "text-gray-600",
    chip: "bg-gray-100 text-gray-600",
    bar: "bg-gray-400",
  },
};

export function DriveNavBar({
  title,
  icon,
  accent,
  orderCode,
  mainText,
  subText,
  distanceText,
  durationText,
  progress,
  waitingForRoute,
  simulated,
}: {
  title: string;
  icon: ReactNode;
  accent: Accent;
  orderCode: string;
  mainText: string;
  subText: string | null;
  distanceText: string | null;
  durationText: string | null;
  /** Fracción completada de la ruta (0..1) o null si no hay ruta. */
  progress?: number | null;
  waitingForRoute?: boolean;
  simulated?: boolean;
}) {
  const accentStyle = ACCENT_STYLES[accent];

  return (
    <div className="relative z-10 border-t border-gray-100 bg-white px-4 pb-2.5 pt-2 shadow-[0_-6px_18px_rgba(3,7,18,0.14)]">
      <div className="flex items-center gap-2.5">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${accentStyle.iconWrap}`}
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span
              className={`text-[10px] font-black uppercase tracking-wider ${accentStyle.title}`}
            >
              {title}
            </span>
            <span
              className={`rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums ${accentStyle.chip}`}
            >
              Pedido #{orderCode}
            </span>
            {simulated && (
              <span className="rounded-full bg-purple-100 px-1.5 py-px text-[10px] font-bold text-purple-700">
                🧪 SIM
              </span>
            )}
          </div>

          {waitingForRoute ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
              Calculando ruta…
            </p>
          ) : (
            <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-[#09193B]">
              {mainText}
            </p>
          )}
        </div>

        {(distanceText || durationText) && (
          <div className="flex shrink-0 flex-col items-end gap-1">
            {distanceText && (
              <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-xs font-black tabular-nums text-gray-700">
                {distanceText}
              </span>
            )}
            {durationText && (
              <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-xs font-black tabular-nums text-blue-700">
                {durationText}
              </span>
            )}
          </div>
        )}
      </div>

      {subText && (
        <p className="mt-1 truncate pl-[50px] text-xs text-gray-500">{subText}</p>
      )}

      {typeof progress === "number" && progress >= 0 && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${accentStyle.bar}`}
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
      )}
    </div>
  );
}
