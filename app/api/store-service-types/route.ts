import { NextRequest, NextResponse } from 'next/server';
import { isDeliveryDriverAvailable } from '@/lib/fulfillment';
import { backendClient } from '@/sanity/lib/backendClient';
import { getCommercialSettings } from '@/lib/commercial-config';
import { resolveEffectiveCommercialConditions } from '@/lib/commercial-rules';

const STORE_SERVICE_TYPES_QUERY = `*[_type == "affiliateStore" && _id == $storeId][0] {
  _id,
  name,
  isOpen,
  manualOperationalStatus,
  highDemandMode,
  hasOwnDelivery,
  serviceTypes,
  commercialPlanId,
  commercialOverrides,
  commercialReviewRequired,
  commercialNotes,
  commercialPlanStartedAt,
  platformCommissionPercent,
  "connectedCommunityDrivers": count(*[
    _type == "repartidor" &&
    activo == true &&
    disponible == true &&
    (!defined(disponibleHasta) || disponibleHasta > now()) &&
    !defined(tiendaAsignada)
  ]),
  operatingHours,
  deliveryTimeMin,
  scheduledOrdersEnabled,
  minimumPreparationMinutes,
  scheduledOrderIntervalMinutes,
  maximumScheduledDays,
  lastDeliveryOrderMinutesBeforeClose,
  lastPickupOrderMinutesBeforeClose
}`;

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    if (!storeId) {
      return NextResponse.json(
        { error: 'Se requiere storeId como parametro' },
        { status: 400 }
      );
    }

    const mockServiceTypes: Record<string, any> = {
      'mock-pe-centro': {
        delivery: true,
        pickup: true,
        deliveryRadius: 15,
        minimumOrderDelivery: 150,
        onDemand: false,
        onDemandExtraMinutes: 15
      },
      'mock-pe-plaza': {
        delivery: true,
        pickup: true,
        deliveryRadius: 12,
        minimumOrderDelivery: 100,
        onDemand: false,
        onDemandExtraMinutes: 15
      },
      'mock-pe-barrio': {
        delivery: false,
        pickup: true,
        deliveryRadius: 0,
        minimumOrderDelivery: 0,
        onDemand: false,
        onDemandExtraMinutes: 15
      }
    };
    const mockStoreStates: Record<string, { isOpen: boolean; manualOperationalStatus: 'open' | 'closed' | 'auto'; highDemandMode: boolean }> = {
      'mock-pe-centro': { isOpen: true, manualOperationalStatus: 'auto', highDemandMode: false },
      'mock-pe-plaza': { isOpen: true, manualOperationalStatus: 'auto', highDemandMode: false },
      'mock-pe-barrio': { isOpen: true, manualOperationalStatus: 'auto', highDemandMode: false }
    };

    const defaultServiceTypes = {
      delivery: true,
      pickup: true,
      deliveryRadius: 10,
      minimumOrderDelivery: 100,
      onDemand: false,
      onDemandExtraMinutes: 15
    };
    const defaultStoreState = {
      isOpen: true,
      manualOperationalStatus: 'auto' as const,
      highDemandMode: false
    };

    let serviceTypes = mockServiceTypes[storeId] || defaultServiceTypes;
    let storeName = 'Tienda Mock';
    let isOpen = mockStoreStates[storeId]?.isOpen ?? defaultStoreState.isOpen;
    let manualOperationalStatus = mockStoreStates[storeId]?.manualOperationalStatus ?? defaultStoreState.manualOperationalStatus;
    let highDemandMode =
      mockStoreStates[storeId]?.highDemandMode ??
      defaultStoreState.highDemandMode;
    let hasOwnDelivery = Boolean(mockServiceTypes[storeId]);
    let connectedCommunityDrivers = 0;
    let scheduleConfig: Record<string, unknown> = {};
    let commercial = resolveEffectiveCommercialConditions({}, await getCommercialSettings());

    if (!mockServiceTypes[storeId]) {
      try {
        const store = await backendClient.fetch(STORE_SERVICE_TYPES_QUERY, { storeId });
        if (store) {
          serviceTypes = store.serviceTypes || defaultServiceTypes;
          commercial = resolveEffectiveCommercialConditions(store, await getCommercialSettings());
          storeName = store.name;
          isOpen = store.isOpen ?? defaultStoreState.isOpen;
          manualOperationalStatus = store.manualOperationalStatus ?? defaultStoreState.manualOperationalStatus;
          highDemandMode =
            store.highDemandMode ?? store.serviceTypes?.onDemand ?? defaultStoreState.highDemandMode;
          hasOwnDelivery = store.hasOwnDelivery === true;
          connectedCommunityDrivers = Number(store.connectedCommunityDrivers || 0);
          scheduleConfig = {
            operatingHours: store.operatingHours,
            deliveryTimeMin: store.deliveryTimeMin,
            scheduledOrdersEnabled: store.scheduledOrdersEnabled,
            minimumPreparationMinutes: store.minimumPreparationMinutes,
            scheduledOrderIntervalMinutes: store.scheduledOrderIntervalMinutes,
            maximumScheduledDays: store.maximumScheduledDays,
            lastDeliveryOrderMinutesBeforeClose: store.lastDeliveryOrderMinutesBeforeClose,
            lastPickupOrderMinutesBeforeClose: store.lastPickupOrderMinutesBeforeClose,
          };
        }
      } catch (sanityError) {
        console.log('Error obteniendo de Sanity, usando configuracion por defecto:', sanityError);
      }
    } else {
      const mockNames: Record<string, string> = {
        'mock-pe-centro': 'Tienda Centro Pedro Escobedo',
        'mock-pe-plaza': 'Tienda Plaza San Miguel',
        'mock-pe-barrio': 'Tienda Barrio Alto'
      };
      storeName = mockNames[storeId] || 'Tienda Mock';
    }

    return NextResponse.json({
      success: true,
      requestId,
      storeId,
      storeName,
      isOpen,
      manualOperationalStatus,
      highDemandMode,
      deliveryAvailability: {
        available:
          serviceTypes.delivery === true &&
          isDeliveryDriverAvailable(hasOwnDelivery, connectedCommunityDrivers),
        provider: hasOwnDelivery ? 'restaurant' : 'elmenu',
        connectedDrivers: hasOwnDelivery ? null : connectedCommunityDrivers,
      },
      ...scheduleConfig,
      commercial,
      serviceTypes: {
        ...serviceTypes,
        onDemand: highDemandMode
      }
    });

  } catch (error) {
    console.error('Error en /api/store-service-types:', { requestId, error });

    return NextResponse.json(
      {
        error: 'Error interno del servidor',
        requestId
      },
      { status: 500 }
    );
  }
}
