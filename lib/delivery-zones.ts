import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, polygon } from "@turf/helpers";

export type LatLng = {
  lat: number;
  lng: number;
};

export type DeliveryZone = {
  id: string;
  name: string;
  basePrice: number;
  color?: string;
  active?: boolean;
  coordinates: LatLng[];
};

export type DemandLevel = "low" | "medium" | "high" | "custom";

export type DemandSettings = {
  level: DemandLevel;
  multiplier: number;
};

export type ScheduleRule = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  multiplier: number;
  active?: boolean;
};

export type OutsideZoneRule = {
  mode: "reject" | "special_fee";
  specialFee: number;
};

export type DeliveryPricingConfig = {
  zones: DeliveryZone[];
  demand: DemandSettings;
  scheduleRules: ScheduleRule[];
  outsideZone: OutsideZoneRule;
  debug?: boolean;
};

export type DeliveryQuoteInput = {
  lat: number;
  lng: number;
  orderDate?: Date | string;
};

export type DeliveryQuoteResult = {
  allowed: boolean;
  finalPrice: number | null;
  zone: DeliveryZone | null;
  demandMultiplier: number;
  scheduleMultiplier: number;
  scheduleRule: ScheduleRule | null;
  reason?: string;
  debug: string[];
};

export const DEFAULT_DELIVERY_CONFIG: DeliveryPricingConfig = {
  zones: [
    {
      id: "zona-centro",
      name: "Zona Centro",
      basePrice: 45,
      color: "#f97316",
      active: true,
      coordinates: [
        { lat: 20.6045, lng: -100.4038 },
        { lat: 20.6045, lng: -100.3757 },
        { lat: 20.5808, lng: -100.3757 },
        { lat: 20.5808, lng: -100.4038 },
      ],
    },
  ],
  demand: {
    level: "low",
    multiplier: 1,
  },
  scheduleRules: [
    {
      id: "normal",
      name: "Horario normal",
      startTime: "08:00",
      endTime: "20:59",
      multiplier: 1,
      active: true,
    },
    {
      id: "nocturno",
      name: "Horario nocturno",
      startTime: "21:00",
      endTime: "23:59",
      multiplier: 1.2,
      active: true,
    },
    {
      id: "pico",
      name: "Horario pico",
      startTime: "13:00",
      endTime: "15:30",
      multiplier: 1.3,
      active: true,
    },
  ],
  outsideZone: {
    mode: "special_fee",
    specialFee: 85,
  },
  debug: true,
};

export const EMPTY_STORE_DELIVERY_CONFIG: DeliveryPricingConfig = {
  zones: [],
  demand: { level: "low", multiplier: 1 },
  scheduleRules: [],
  outsideZone: { mode: "reject", specialFee: 0 },
  debug: false,
};

export const PEDRO_ESCOBEDO_DELIVERY_TEMPLATE: DeliveryPricingConfig = {
  zones: [
    {
      id: "pedro-escobedo-chamizal",
      name: "Chamizal",
      basePrice: 45,
      color: "#f97316",
      active: true,
      coordinates: [
        { lat: 20.52502278890541, lng: -100.14845370178223 },
        { lat: 20.50162981550622, lng: -100.11923790283204 },
        { lat: 20.488245790448666, lng: -100.12958050079347 },
        { lat: 20.490497012665834, lng: -100.13175606689455 },
        { lat: 20.495722936805148, lng: -100.13135671234133 },
        { lat: 20.50830462318209, lng: -100.14750956420899 },
        { lat: 20.511880864367452, lng: -100.15493391876221 },
      ],
    },
    {
      id: "pedro-escobedo-centro",
      name: "Pedro Escobedo Centro",
      basePrice: 30,
      color: "#0ea5e9",
      active: true,
      coordinates: [
        { lat: 20.50825094628211, lng: -100.14962634918214 },
        { lat: 20.50929602427953, lng: -100.15241584655763 },
        { lat: 20.51120528297684, lng: -100.15668592330934 },
        { lat: 20.50950704877913, lng: -100.15867075798036 },
        { lat: 20.4948652784827, lng: -100.16074142333986 },
        { lat: 20.49309651420675, lng: -100.15486202117921 },
        { lat: 20.49422209383453, lng: -100.1505919444275 },
        { lat: 20.4928553174969, lng: -100.14631113883974 },
        { lat: 20.48443329445361, lng: -100.13828865167619 },
        { lat: 20.49051367971464, lng: -100.13200289484979 },
        { lat: 20.49562905674691, lng: -100.13181111690523 },
        { lat: 20.505939690774806, lng: -100.14449796554567 },
        { lat: 20.507095322887416, lng: -100.14680466529848 },
      ],
    },
    {
      id: "pedro-escobedo-lira",
      name: "Lira",
      basePrice: 80,
      color: "#22c55e",
      active: true,
      coordinates: [
        { lat: 20.470849548749303, lng: -100.16654636611939 },
        { lat: 20.463692847294478, lng: -100.16427112808228 },
        { lat: 20.46152164718805, lng: -100.15324115982055 },
        { lat: 20.483835295238343, lng: -100.13796329727172 },
        { lat: 20.49310416701279, lng: -100.1474264930725 },
        { lat: 20.49212190389574, lng: -100.15311313858032 },
        { lat: 20.497071635653796, lng: -100.16937877883912 },
      ],
    },
    {
      id: "pedro-escobedo-el-sauz",
      name: "El Sauz",
      basePrice: 70,
      color: "#a855f7",
      active: true,
      coordinates: [
        { lat: 20.48442456052897, lng: -100.13729883422852 },
        { lat: 20.489811492851146, lng: -100.13184786071777 },
        { lat: 20.487037648348323, lng: -100.12852155914307 },
        { lat: 20.49055519625253, lng: -100.12591427078246 },
        { lat: 20.482012439948715, lng: -100.11472391357421 },
        { lat: 20.470556103011077, lng: -100.10622667541503 },
        { lat: 20.47152102783952, lng: -100.1215918182373 },
      ],
    },
  ],
  demand: { level: "low", multiplier: 1 },
  scheduleRules: [],
  outsideZone: { mode: "reject", specialFee: 0 },
  debug: false,
};

export function getDeliveryPricingConfigId(storeId?: string | null) {
  return storeId ? `deliveryPricingConfig.${storeId}` : "deliveryPricingConfig.main";
}

export function parseOptionalPrice(value: string) {
  if (value.trim() === "") return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function updateDeliveryZone(config: DeliveryPricingConfig, zoneId: string, patch: Partial<DeliveryZone>) {
  return {
    ...config,
    zones: config.zones.map((zone) => (zone.id === zoneId ? { ...zone, ...patch } : zone)),
  };
}

export function normalizeDeliveryConfig(config?: Partial<DeliveryPricingConfig> | null): DeliveryPricingConfig {
  return {
    zones: Array.isArray(config?.zones) ? config.zones : DEFAULT_DELIVERY_CONFIG.zones,
    demand: {
      level: config?.demand?.level ?? DEFAULT_DELIVERY_CONFIG.demand.level,
      multiplier: Number(config?.demand?.multiplier ?? DEFAULT_DELIVERY_CONFIG.demand.multiplier),
    },
    scheduleRules: Array.isArray(config?.scheduleRules)
      ? config.scheduleRules
      : DEFAULT_DELIVERY_CONFIG.scheduleRules,
    outsideZone: {
      mode: config?.outsideZone?.mode ?? DEFAULT_DELIVERY_CONFIG.outsideZone.mode,
      specialFee: Number(config?.outsideZone?.specialFee ?? DEFAULT_DELIVERY_CONFIG.outsideZone.specialFee),
    },
    debug: Boolean(config?.debug ?? DEFAULT_DELIVERY_CONFIG.debug),
  };
}

export function findMatchingZone(zones: DeliveryZone[], lat: number, lng: number) {
  const userPoint = point([lng, lat]);

  return zones.find((zone) => {
    if (zone.active === false || zone.coordinates.length < 3) return false;
    const ring = zone.coordinates.map((coord) => [coord.lng, coord.lat]);
    const first = ring[0];
    const last = ring[ring.length - 1];
    const closedRing = first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];

    return booleanPointInPolygon(userPoint, polygon([closedRing]));
  }) ?? null;
}

export function findScheduleRule(rules: ScheduleRule[], date: Date) {
  // Use Mexico City timezone for schedule calculations
  const mexicoTimeStr = date.toLocaleString('en-US', { 
    timeZone: 'America/Mexico_City',
    hour12: false 
  });
  const mexicoDate = new Date(mexicoTimeStr);
  const minutes = mexicoDate.getHours() * 60 + mexicoDate.getMinutes();

  return rules.find((rule) => {
    if (rule.active === false) return false;
    const start = timeToMinutes(rule.startTime);
    const end = timeToMinutes(rule.endTime);
    if (start == null || end == null) return false;

    if (start <= end) return minutes >= start && minutes <= end;
    return minutes >= start || minutes <= end;
  }) ?? null;
}

export function calculateDeliveryQuote(
  rawConfig: Partial<DeliveryPricingConfig> | null | undefined,
  input: DeliveryQuoteInput
): DeliveryQuoteResult {
  const config = normalizeDeliveryConfig(rawConfig);
  const date = input.orderDate ? new Date(input.orderDate) : new Date();
  const debug: string[] = [];
  const zone = findMatchingZone(config.zones, input.lat, input.lng);
  const scheduleRule = findScheduleRule(config.scheduleRules, date);
  const demandMultiplier = Number(config.demand.multiplier || 1);
  const scheduleMultiplier = Number(scheduleRule?.multiplier || 1);

  debug.push(`Ubicacion: ${input.lat.toFixed(6)}, ${input.lng.toFixed(6)}`);
  debug.push(zone ? `Zona detectada: ${zone.name}` : "Zona detectada: ninguna");
  debug.push(`Multiplicador demanda: ${demandMultiplier}`);
  debug.push(scheduleRule ? `Horario aplicado: ${scheduleRule.name}` : "Horario aplicado: ninguno");

  if (!zone) {
    if (config.outsideZone.mode === "reject") {
      return {
        allowed: false,
        finalPrice: null,
        zone: null,
        demandMultiplier,
        scheduleMultiplier,
        scheduleRule,
        reason: "La ubicacion esta fuera de las zonas de entrega.",
        debug,
      };
    }

    const finalPrice = roundCurrency(config.outsideZone.specialFee * demandMultiplier * scheduleMultiplier);
    debug.push(`Tarifa especial fuera de zona: ${config.outsideZone.specialFee}`);
    debug.push(`Precio final: ${finalPrice}`);

    return {
      allowed: true,
      finalPrice,
      zone: null,
      demandMultiplier,
      scheduleMultiplier,
      scheduleRule,
      reason: "Tarifa especial aplicada por estar fuera de zona.",
      debug,
    };
  }

  const finalPrice = roundCurrency(zone.basePrice * demandMultiplier * scheduleMultiplier);
  debug.push(`Precio base zona: ${zone.basePrice}`);
  debug.push(`Precio final: ${finalPrice}`);

  return {
    allowed: true,
    finalPrice,
    zone,
    demandMultiplier,
    scheduleMultiplier,
    scheduleRule,
    debug,
  };
}

export function validateZoneOverlaps(zones: DeliveryZone[]) {
  const warnings: string[] = [];

  zones.forEach((zone) => {
    zones.forEach((otherZone) => {
      if (zone.id === otherZone.id) return;
      const overlapPoint = zone.coordinates.find((coord) => findMatchingZone([otherZone], coord.lat, coord.lng));
      if (overlapPoint) {
        warnings.push(`${zone.name} podria superponerse con ${otherZone.name}.`);
      }
    });
  });

  return Array.from(new Set(warnings));
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}
