"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, MessageSquarePlus, ShieldAlert, Star } from "lucide-react";
import {
  DEFAULT_RATING,
  RATING_COMMENT_PLACEHOLDER,
  RATING_INCIDENT_PLACEHOLDER,
  RATING_INTRO,
  RATING_LEVELS,
  RATING_LEVEL_LABEL,
  RATING_PROMPT,
  RATING_REPORT_NOTE,
  RATING_REPORT_OPTION_LABEL,
  RATING_THANKS_COPY,
  isSeriousIncident,
  ratingHasReasons,
  ratingSubmitLabel,
  reasonsFor,
  sanitizeReasons,
  type RatingLevel,
  type RatingRole,
} from "@/lib/order-ratings";

const NAVY = "#09193B";
const BRAND = "#EB1901";
const IDLE_STAR = "#D8DCE3";

export type StarRatingPayload = {
  rating: number;
  reasons: string[];
  comment?: string;
  incidentDescription?: string;
  requestContact?: boolean;
};

/**
 * Selector de 3 ESTRELLAS + menú contextual según la calificación.
 *
 * Presentacional y reutilizable: el mismo componente sirve para que el cliente
 * evalúe al repartidor y para que el repartidor evalúe al cliente. Todo el
 * conocimiento de motivos/copy vive en `lib/order-ratings.ts` (puro).
 *
 * El 3★ viene PRESELECCIONADO: si todo salió bien, basta un toque en "Listo"
 * y no se muestra ningún formulario adicional.
 */
export function StarRating({
  role,
  submitting,
  serverError,
  submitted,
  onEngaged,
  onSubmit,
}: {
  role: RatingRole;
  submitting: boolean;
  serverError?: string | null;
  /** true tras enviarse con éxito (muestra el cierre). */
  submitted: boolean;
  /** Se llama la primera vez que el usuario interactúa (p. ej. para pausar
   *  un autocierre del contenedor mientras evalúa). */
  onEngaged?: () => void;
  onSubmit: (payload: StarRatingPayload) => Promise<boolean>;
}) {
  // 3 estrellas preseleccionadas: la mayoría se completa con un toque.
  const [rating, setRating] = useState<RatingLevel>(DEFAULT_RATING);
  const [selected, setSelected] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [commentOpen, setCommentOpen] = useState(false);
  const [incidentDescription, setIncidentDescription] = useState("");
  const [reportOpen, setReportOpen] = useState(false);

  const reasons = useMemo(() => reasonsFor(role, rating), [role, rating]);
  const serious = isSeriousIncident(role, rating, selected);
  const showReasons = ratingHasReasons(rating);

  function chooseLevel(level: RatingLevel) {
    onEngaged?.();
    if (level === rating) return;
    setRating(level);
    // Al cambiar de nivel se descartan los motivos incompatibles; volver a 3★
    // oculta las opciones y limpia todo lo seleccionado.
    setSelected((prev) => sanitizeReasons(role, level, prev));
    setCommentOpen(false);
    setComment("");
    setIncidentDescription("");
    setReportOpen(false);
  }

  function toggleReason(code: string) {
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code]
    );
  }

  async function handleSubmit() {
    if (submitting) return;
    await onSubmit({
      rating,
      reasons: showReasons ? selected : [],
      comment: showReasons && comment.trim() ? comment.trim() : undefined,
      incidentDescription: serious && incidentDescription.trim() ? incidentDescription.trim() : undefined,
      requestContact: serious ? reportOpen : undefined,
    });
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
          <Check className="h-6 w-6 text-green-600" strokeWidth={3} />
        </div>
        <p className="mt-4 text-base font-extrabold" style={{ color: NAVY }}>
          {RATING_THANKS_COPY[role][rating]}
        </p>
        {serious && (
          <p className="mt-1.5 text-sm text-gray-500">{RATING_REPORT_NOTE[role]}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-base font-extrabold leading-snug" style={{ color: NAVY }}>
        {RATING_PROMPT[role]}
      </p>

      {/* 3 estrellas: grandes y fáciles de tocar */}
      <div
        role="radiogroup"
        aria-label="Calificación de 1 a 3 estrellas"
        className="mt-4 flex items-center justify-center gap-4"
      >
        {RATING_LEVELS.map((level) => {
          const active = level <= rating;
          return (
            <motion.button
              key={level}
              type="button"
              role="radio"
              whileTap={{ scale: 0.88 }}
              onClick={() => chooseLevel(level)}
              aria-checked={rating === level}
              aria-label={`${level} de 3: ${RATING_LEVEL_LABEL[level]}`}
              className="rounded-2xl p-2 transition-colors"
            >
              <Star
                className="h-11 w-11 transition-transform duration-150 hover:scale-105"
                strokeWidth={active ? 2 : 1.8}
                fill={active ? BRAND : "none"}
                style={{ color: active ? BRAND : IDLE_STAR }}
              />
            </motion.button>
          );
        })}
      </div>

      {/* 3★: mensaje positivo, sin ningún formulario adicional. */}
      {!showReasons && (
        <p className="mt-4 text-center text-sm font-semibold leading-snug" style={{ color: NAVY }}>
          {RATING_INTRO[role][DEFAULT_RATING]}
        </p>
      )}

      {/* Menú contextual: solo 2★ y 1★ */}
      <AnimatePresence initial={false} mode="wait">
        {showReasons && (
          <motion.div
            key={`panel-${rating}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 1, 1] }}
            className="overflow-hidden"
          >
            <p className="mt-4 text-sm font-semibold leading-snug" style={{ color: NAVY }}>
              {RATING_INTRO[role][rating]}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {reasons.map((reason) => {
                const isOn = selected.includes(reason.code);
                return (
                  <button
                    key={reason.code}
                    type="button"
                    onClick={() => toggleReason(reason.code)}
                    aria-pressed={isOn}
                    className={`rounded-full border px-3 py-1.5 text-left text-xs font-semibold transition ${
                      isOn ? "text-white" : "border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                    style={isOn ? { backgroundColor: NAVY, borderColor: NAVY } : undefined}
                  >
                    {reason.label}
                  </button>
                );
              })}
            </div>

            {/* Comentario opcional (nunca obligatorio) */}
            <button
              type="button"
              onClick={() => setCommentOpen((open) => !open)}
              className="mt-3 flex items-center gap-1.5 text-xs font-bold"
              style={{ color: BRAND }}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              {commentOpen ? "Ocultar comentario" : "Agregar un comentario (opcional)"}
            </button>
            {commentOpen && (
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value.slice(0, 1000))}
                rows={3}
                placeholder={RATING_COMMENT_PLACEHOLDER[role]}
                className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400"
                style={{ outlineColor: NAVY }}
              />
            )}

            {/* Incidente grave: opción secundaria de ayuda/reporte privado */}
            {serious && (
              <div className="mt-3 rounded-xl bg-rose-50/70 p-3">
                <button
                  type="button"
                  onClick={() => setReportOpen((open) => !open)}
                  aria-expanded={reportOpen}
                  className="flex w-full items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-left text-xs font-bold"
                  style={{ color: NAVY }}
                >
                  <ShieldAlert className="h-4 w-4" style={{ color: BRAND }} />
                  {RATING_REPORT_OPTION_LABEL[role]}
                </button>
                {reportOpen && (
                  <div className="mt-2">
                    <textarea
                      value={incidentDescription}
                      onChange={(event) =>
                        setIncidentDescription(event.target.value.slice(0, 2000))
                      }
                      rows={3}
                      placeholder={RATING_INCIDENT_PLACEHOLDER}
                      className="w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400"
                      style={{ outlineColor: NAVY }}
                    />
                    <p className="mt-1.5 text-[11px] leading-snug text-gray-500">
                      {RATING_REPORT_NOTE[role]}
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {serverError && (
        <p className="mt-3 text-xs font-semibold text-red-600">{serverError}</p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-black uppercase tracking-wide text-white transition hover:brightness-95 disabled:opacity-60"
        style={{ backgroundColor: serious ? BRAND : NAVY }}
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {ratingSubmitLabel(rating)}
      </button>
    </div>
  );
}