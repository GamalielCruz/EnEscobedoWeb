"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

interface SegmentedTabOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

/**
 * Control segmentado (píldora deslizante) con la misma apariencia que el
 * selector Enviar/Recibir de Mandados. El value puede ser null mientras no
 * hay nada seleccionado; en ese caso no se muestra la píldora activa.
 */
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  compact = false,
  layoutId,
  className,
}: {
  value: T | null;
  onChange: (next: T) => void;
  options: Array<SegmentedTabOption<T>>;
  compact?: boolean;
  layoutId: string;
  className?: string;
}) {
  return (
    <div
      className={`relative flex rounded-full bg-slate-100 p-1 ${compact ? "w-full max-w-[11rem]" : "w-full"} ${className ?? ""}`}
    >
      {options.map((option) => {
        const active = value === option.value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`relative flex-1 rounded-full ${compact ? "py-1.5" : "py-2.5"}`}
            aria-pressed={active}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-white shadow-sm"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <span
              className={`relative z-10 flex items-center justify-center gap-1.5 text-sm font-bold transition-colors duration-200 ${
                active ? "text-[#09193B]" : "text-slate-500"
              }`}
            >
              {Icon && <Icon className="h-4 w-4" />}
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
