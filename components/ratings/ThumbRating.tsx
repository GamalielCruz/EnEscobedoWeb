"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, MessageSquarePlus, ThumbsUp } from "lucide-react";
import {
  RATING_COMMENT_PLACEHOLDER,
  RATING_INCIDENT_PLACEHOLDER,
  RATING_INTRO,
  RATING_LEVEL_LABEL,
  RATING_LEVELS,
  RATING_REPORT_CONTACT_LABEL,
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
const BRAND = "#EB1902";

export type ThumbRatingPayload = {
  rating: number;
  reasons: string[];
  comment?: string;
  incidentDescription?: string;
  requestContact?: boolean;
};

/**
 * Selector de 5 pulgares + menú contextual según la calificación.
 *
 * Presentacional y reutilizable: el mismo componente sirve para que el cliente
 * evalúe al repartidor y para que el repartidor evalúe al cliente. Todo el
 * conocimiento de motivos/copy vive en `lib/order-ratings.ts` (puro).
 */
export function ThumbRating({
  role,
  evaluateeName,
  submitting,
  serverError,
  submitted,
  onEngaged,
  onSubmit,
}: {
  role: RatingRole;
  evaluateeName?: string | null;
  submitting: boolean;
  serverError?: string | null;
  /** true tras enviarse con éxito (muestra el cierre). */
  submitted: boolean;
  /** Se llama la primera vez que el usuario interactúa (p. ej. para pausar
   *  un autocierre del contenedor mientras evalúa). */
  onEngaged?: () => void;
  onSubmit: (payload: ThumbRatingPayload) => Promise<boolean>;
}) {
  const [rating, setRating] = useState<RatingLevel | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [commentOpen, setCommentOpen] = useState(false);
  const [incidentDescription, setIncidentDescription] = useState("");
  const [requestContact, setRequestContact] = useState(false);

  const reasons = useMemo(() => (rating ? reasonsFor(role, rating) : []), [role, rating]);
  const serious = isSeriousIncident(role, rating, selected);
  const evaluatee = evaluateeName?.trim() || (role === "customer" ? "tu repartidor" : "el cliente");

  function chooseLevel(level: RatingLevel) {
    onEngaged?.();
    setRating(level);
    // Al cambiar de nivel se descartan los motivos incompatibles.
    setSelected((prev) => sanitizeReasons(role, level, prev));
    if (level === 5) {
      setIncidentDescription("");
      setRequestContact(false);
    }
  }

  function toggleReason(code: string) {
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code]
    );
  }

  async function handleSubmit() {
    if (rating == null || submitting) return;
    await onSubmit({
      rating,
      reasons: selected,
      comment: comment.trim() || undefined,
      incidentDescription: serious ? incidentDescription.trim() || undefined : undefined,
      requestContact: serious ? requestContact : undefined,
    });
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
          <ThumbsUp className="h-6 w-6 text-green-600" />
        </div>
        <p className="mt-4 text-base font-extrabold" style={{ color: NAVY }}>
          {RATING_THANKS_COPY[role]}
        </p>
        {serious && (
          <p className="mt-1.5 text-sm text-gray-500">
            Tu reporte quedó registrado para revisión. No es una sanción automática: una persona
            del equipo lo revisará.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-base font-extrabold leading-snug" style={{ color: NAVY }}>
        {role === "customer"
          ? `¿Cómo fue tu experiencia con ${evaluatee}?`
          : `¿Cómo fue la entrega con ${evaluatee}?`}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        {role === "customer"
          ? "Toca los pulgares para calificar."
          : "Toca los pulgares para calificar al cliente."}
      </p>

      {/* 5 pulgares */}
      <div
        role="group"
        aria-label="Calificación de 1 a 5 pulgares"
        className="mt-4 flex items-center justify-between gap-2"
      >
        {RATING_LEVELS.map((level) => {
          const active = rating != null && level <= rating;
          return (
            <motion.button
              key={level}
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => chooseLevel(level)}
              aria-pressed={rating === level}
              aria-label={`${level} de 5: ${RATING_LEVEL_LABEL[role][level]}`}
              className="flex-1 rounded-xl py-2 transition-colors"
              style={{ color: active ? BRAND : "#D1D5DB" }}
            >
              <ThumbsUp
                className="mx-auto h-7 w-7 transition-transform duration-150 hover:scale-110"
                strokeWidth={active ? 2.4 : 1.9}
                fill={active ? BRAND : "none"}
              />
            </motion.button>
          );
        })}
      </div>

      {/* Menú contextual */}
      <AnimatePresence initial={false}>
        {rating != null && (
          <motion.div
            key={`panel-${rating}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="mt-4 text-sm font-semibold leading-snug" style={{ color: NAVY }}>
              {RATING_INTRO[role][rating]}
            </p>

            {ratingHasReasons(rating) && (
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
            )}

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
                className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#09193B] focus:outline-none"
              />
            )}

            {/* Incidente grave: descripción + solicitud de contacto */}
            {serious && (
              <div className="mt-3 rounded-xl bg-rose-50/70 p-3">
                <p className="text-xs font-bold" style={{ color: NAVY }}>
                  ¿Quieres ampliar lo sucedido?
                </p>
                <textarea
                  value={incidentDescription}
                  onChange={(event) => setIncidentDescription(event.target.value.slice(0, 2000))}
                  rows={3}
                  placeholder={RATING_INCIDENT_PLACEHOLDER}
                  className="mt-2 w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#09193B] focus:outline-none"
                />
                <label className="mt-2 flex items-start gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={requestContact}
                    onChange={(event) => setRequestContact(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#EB1902]"
                  />
                  <span>{RATING_REPORT_CONTACT_LABEL}</span>
                </label>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {serverError && (
        <p className="mt-3 text-xs font-semibold text-red-600">{serverError}</p>
      )}

      {rating != null && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-black uppercase tracking-wide text-white transition hover:brightness-95 disabled:opacity-50"
          style={{ backgroundColor: serious ? BRAND : NAVY }}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : ratingSubmitLabel(serious)}
        </button>
      )}
    </div>
  );
}
