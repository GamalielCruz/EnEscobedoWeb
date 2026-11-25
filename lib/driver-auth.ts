import { auth, clerkClient } from "@clerk/nextjs/server";
import { backendClient } from "@/sanity/lib/backendClient";
import { NextResponse } from "next/server";

type RepartidorDoc = {
  _id: string;
  nombre: string;
  telefono: string;
  clerkUserId?: string;
  activo: boolean;
  bloqueado: boolean;
  disponible: boolean;
  disponibleDesde?: string;
  disponibleHasta?: string;
  duracionDisponibilidadMinutos?: number;
  estadoDisponibilidad?: "available" | "offline" | "busy" | "offer_pending";
  /** Intención: false = no quiere recibir nuevas ofertas tras su servicio activo. */
  aceptaNuevasOfertas?: boolean;
  esperandoSeleccionDisponibilidad?: boolean;
  extensionPendiente?: boolean;
  prioridad?: number;
  calificacion?: number;
  tiendaAsignada?: { _ref: string } | null;
  ultimaUbicacion?: { lat?: number; lng?: number; reportedAt?: string } | null;
};

const DRIVER_BY_CLERK_ID_QUERY = `*[_type == "repartidor" && clerkUserId == $userId][0]{
  _id,
  nombre,
  telefono,
  activo,
  bloqueado,
  disponible,
  disponibleDesde,
  disponibleHasta,
  duracionDisponibilidadMinutos,
  estadoDisponibilidad,
  aceptaNuevasOfertas,
  esperandoSeleccionDisponibilidad,
  extensionPendiente,
  prioridad,
  calificacion,
  "storeId": tiendaAsignada._ref,
  ultimaUbicacion
}`;

const DRIVER_BY_PHONE_QUERY = `*[_type == "repartidor" && activo == true && telefono in $phones][0]{
  _id,
  nombre,
  telefono,
  activo,
  bloqueado,
  disponible,
  disponibleDesde,
  disponibleHasta,
  duracionDisponibilidadMinutos,
  estadoDisponibilidad,
  aceptaNuevasOfertas,
  esperandoSeleccionDisponibilidad,
  extensionPendiente,
  prioridad,
  calificacion,
  "storeId": tiendaAsignada._ref,
  ultimaUbicacion,
  clerkUserId
}`;

type RequireDriverResult =
  | { ok: true; userId: string; repartidor: RepartidorDoc }
  | { ok: false; error: NextResponse };

function isTransientSanityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();

  return [
    "eai_again",
    "und_err_connect_timeout",
    "connect timeout",
    "fetch failed",
    "network error",
    "timeout",
    "econnreset",
    "socket hang up",
    "fetcherror",
    "temporarily unavailable",
    "request timeout",
  ].some((token) => normalized.includes(token));
}

async function runWithLimitedRetry<T>(operationName: string, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isTransientSanityError(error) || attempt >= 2) {
        throw error;
      }

      console.warn(`[driver-auth] Error transitorio al ${operationName}. Reintentando...`, {
        attempt,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      });
    }
  }

  throw lastError;
}

function normalizePhoneCandidate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function getDriverDisplayName(user: Awaited<ReturnType<typeof clerkClient.prototype.users.getUser>>): string {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return fullName || user.username || "Repartidor";
}

async function ensureDriverProfile(userId: string): Promise<RepartidorDoc | null> {
  const clerkClientInstance = await clerkClient();
  const user = await clerkClientInstance.users.getUser(userId);
  const publicMetadata = (user.publicMetadata ?? {}) as Record<string, unknown>;

  const phoneCandidates = Array.from(
    new Set(
      [
        user.phoneNumbers?.[0]?.phoneNumber,
        publicMetadata.phone,
        publicMetadata.telefono,
      ]
        .map(normalizePhoneCandidate)
        .filter((value): value is string => Boolean(value))
    )
  );

  const repartidorByPhone = phoneCandidates.length
    ? await runWithLimitedRetry("buscar repartidor por teléfono", () =>
        backendClient.fetch<RepartidorDoc | null>(DRIVER_BY_PHONE_QUERY, {
          phones: phoneCandidates,
        })
      )
    : null;

  if (repartidorByPhone) {
    if (repartidorByPhone.clerkUserId !== userId) {
      await runWithLimitedRetry("actualizar el repartidor con clerkUserId", () =>
        backendClient
          .patch(repartidorByPhone._id)
          .set({ clerkUserId: userId })
          .commit()
      );
    }

    return {
      ...repartidorByPhone,
      clerkUserId: userId,
    };
  }

  const created = await runWithLimitedRetry("crear el perfil del repartidor", () =>
    backendClient.create({
      _type: "repartidor",
      nombre: getDriverDisplayName(user),
      telefono: phoneCandidates[0] || "+0000000000",
      clerkUserId: userId,
      activo: true,
      disponible: false,
      estadoDisponibilidad: "offline",
      esperandoSeleccionDisponibilidad: false,
      extensionPendiente: false,
      bloqueado: false,
      prioridad: 0,
      calificacion: 5,
    })
  );

  return created as RepartidorDoc;
}

/**
 * Resolve the authenticated Clerk user to a Sanity repartidor document.
 * Returns 401 if not authenticated, 403 if not a registered driver.
 */
export async function requireDriver(): Promise<RequireDriverResult> {
  const { userId } = await auth();
  if (!userId) {
    return {
      ok: false,
      error: NextResponse.json({ error: "No autorizado" }, { status: 401 }),
    };
  }

  let repartidor: RepartidorDoc | null = await runWithLimitedRetry("buscar repartidor por clerkUserId", () =>
    backendClient.fetch<RepartidorDoc | null>(
      DRIVER_BY_CLERK_ID_QUERY,
      { userId }
    )
  );

  if (!repartidor) {
    try {
      repartidor = await ensureDriverProfile(userId);
    } catch (error) {
      console.error("[driver-auth] Error creando perfil de repartidor", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        ok: false,
        error: NextResponse.json(
          { error: "No se pudo crear tu perfil de repartidor. Contacta a soporte." },
          { status: 500 }
        ),
      };
    }
  }

  if (!repartidor) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "No eres un repartidor registrado en ElMenu" },
        { status: 403 }
      ),
    };
  }

  if (!repartidor.activo) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "Tu cuenta de repartidor está inactiva" },
        { status: 403 }
      ),
    };
  }

  if (repartidor.bloqueado) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "Tu cuenta de repartidor está bloqueada" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId, repartidor };
}

export type { RepartidorDoc };
