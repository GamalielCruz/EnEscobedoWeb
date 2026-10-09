"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tokens y primitivas compartidas del Dispatch Center.
 *
 * Adaptan el lenguaje visual de las cards de la app del repartidor
 * (`components/drive/*`) al contexto administrativo de escritorio:
 * superficies limpias con un solo borde suave, esquinas suaves, espaciado
 * consistente, jerarquía tipográfica fuerte y color reservado únicamente
 * para estados relevantes y acciones.
 *
 * Regla: no anidar contenedores dentro de contenedores. Cuando hace falta
 * separar bloques se usan separadores sutiles o espacio en blanco, nunca
 * otra caja con borde.
 */

/** Color primario de texto (mismo navy que la app del driver). */
export const DISPATCH_TEXT = "text-[#09193B] dark:text-white";
/** Texto secundario. */
export const DISPATCH_MUTED = "text-slate-500 dark:text-slate-400";
/** Etiqueta de sección (misma convención que el driver). */
export const DISPATCH_LABEL =
  "text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500";
/** Superficie base de una card/zona. */
export const DISPATCH_SURFACE =
  "rounded-2xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-[#0d1526]";
/** Acción principal. */
export const DISPATCH_PRIMARY_BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#EB1902] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#c81502] disabled:cursor-not-allowed disabled:opacity-40";
/** Acción secundaria discreta (texto). */
export const DISPATCH_GHOST_BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200";

/** Superficie de una zona principal (cola, mapa, repartidores). */
export function DispatchSurface({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-h-0 flex-col", DISPATCH_SURFACE, className)}>
      {children}
    </div>
  );
}

/**
 * Encabezado de zona: icono + título + contador opcional + acción a la
 * derecha. Deliberadamente sobrio: sin fondo propio ni barra pesada, solo un
 * separador sutil cuando se usa `divided`.
 */
export function DispatchPanelHeader({
  icon: Icon,
  title,
  count,
  subtitle,
  action,
  divided = true,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  count?: number;
  subtitle?: string;
  action?: React.ReactNode;
  divided?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 px-3.5 py-3",
        divided && "border-b border-slate-100 dark:border-white/5",
        className
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0 text-[#EB1902]" />}
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-black", DISPATCH_TEXT)}>{title}</p>
        {subtitle && (
          <p className={cn("mt-0.5 truncate text-[11px] font-medium", DISPATCH_MUTED)}>
            {subtitle}
          </p>
        )}
      </div>
      {count != null && (
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-400">
          {count}
        </span>
      )}
      {action}
    </div>
  );
}

/**
 * Estado vacío compacto y útil: icono sencillo + mensaje + una frase breve.
 * Nunca ocupa más espacio del necesario (antes era un bloque de altura
 * completa que restaba protagonismo al mapa y a los repartidores).
 */
export function DispatchEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-5 py-8 text-center",
        className
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-white/5">
        <Icon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
      </span>
      <p className={cn("text-sm font-bold", DISPATCH_TEXT)}>{title}</p>
      {description && (
        <p className="max-w-[240px] text-xs leading-relaxed text-slate-400 dark:text-slate-500">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
