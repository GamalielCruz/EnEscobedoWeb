import { NextRequest, NextResponse } from 'next/server';
import { client } from '@/sanity/lib/client';
import { 
  findNearestStore, 
  CustomerAddress, 
  CustomerAddressWithCoords,
  AffiliateStore,
  StoreWithDistance 
} from '@/lib/clickCollect';

// Query para obtener todas las tiendas afiliadas activas
const STORES_QUERY = `*[_type == "affiliateStore" && isActive == true] {
  _id,
  name,
  storeId,
  address,
  coordinates,
  contact,
  operatingHours,
  isActive,
  isOpen,
  highDemandMode,
  capacity,
  averageDeliveryTime,
  deliveryTimeMin,
  deliveryTimeMax,
  serviceTypes
}`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, latitude, longitude, useGoogleMaps = false, filterStoreId } = body;

    // Validar que se proporcione dirección O coordenadas
    if (!address && (!latitude || !longitude)) {
      return NextResponse.json(
        { 
          error: 'Se requiere dirección completa O coordenadas (latitude, longitude).',
          required: ['address OR (latitude AND longitude)']
        },
        { status: 400 }
      );
    }

    // Si se proporcionan coordenadas pero no dirección, crear dirección mock
    let customerAddress: CustomerAddressWithCoords;
    
    if (latitude && longitude && !address) {
      customerAddress = {
        street: `Ubicación detectada`,
        city: 'Pedro Escobedo',
        state: 'Querétaro',
        postalCode: '76240',
        country: 'México',
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude)
      };
    } else if (address) {
      // Validar dirección completa
      if (!address.street || !address.city) {
        return NextResponse.json(
          { 
            error: 'Dirección incompleta. Se requiere al menos calle y ciudad.',
            required: ['street', 'city']
          },
          { status: 400 }
        );
      }
      customerAddress = address as CustomerAddressWithCoords;
    } else {
      return NextResponse.json(
        { error: 'Datos de ubicación inválidos' },
        { status: 400 }
      );
    }

    // Obtener todas las tiendas afiliadas de Sanity
    let stores: AffiliateStore[] = [];
    
    try {
      stores = await client.fetch(STORES_QUERY);
    } catch (sanityError) {
      console.log('Error obteniendo tiendas de Sanity, usando datos mock:', sanityError);
    }

    // Filtrar por tienda específica si se proporciona filterStoreId
    if (filterStoreId) {
      stores = stores.filter(store => store._id === filterStoreId);
      if (stores.length === 0) {
        return NextResponse.json(
          { error: 'No se encontró la tienda especificada' },
          { status: 404 }
        );
      }
    }

    // Validar y limpiar datos de tiendas de Sanity
    stores = stores.map((store) => {
      // Normalizar coordenadas desde distintos formatos posibles
      const coords = store.coordinates || {};

      // Casos comunes: { latitude, longitude } || { lat, lng } || { lat: '19.4', lng: '-99.1' } || [lon, lat]
      let latitude: number | undefined;
      let longitude: number | undefined;

      if (coords) {
        if (typeof coords.latitude === 'number' && typeof coords.longitude === 'number') {
          latitude = coords.latitude;
          longitude = coords.longitude;
        } else if (typeof (coords as any).lat === 'number' && typeof (coords as any).lng === 'number') {
          latitude = (coords as any).lat;
          longitude = (coords as any).lng;
        } else if (typeof (coords as any).lat === 'string' && typeof (coords as any).lng === 'string') {
          latitude = parseFloat((coords as any).lat);
          longitude = parseFloat((coords as any).lng);
        } else if (Array.isArray(coords) && coords.length >= 2) {
          // Sanity geoJSON sometimes stores [lng, lat]
          const maybeLng = parseFloat(String((coords as any)[0]));
          const maybeLat = parseFloat(String((coords as any)[1]));
          if (!Number.isNaN(maybeLat) && !Number.isNaN(maybeLng)) {
            latitude = maybeLat;
            longitude = maybeLng;
          }
        } else if (typeof coords.latitude === 'string' && typeof coords.longitude === 'string') {
          latitude = parseFloat(coords.latitude);
          longitude = parseFloat(coords.longitude);
        }
      }

      // Si no se pudieron normalizar, intentar buscar en propiedades alternativas
      if ((latitude === undefined || longitude === undefined) && store.address) {
        // Buscar coordenadas alternativas si existen
        console.log('Buscando coordenadas alternativas para:', store.name);
      }

      // Fallback a 0,0 si no hay coordenadas válidas
      if (typeof latitude !== 'number' || typeof longitude !== 'number' || Number.isNaN(latitude) || Number.isNaN(longitude)) {
        console.warn(`Tienda ${store?.name || store?._id} tiene coordenadas inválidas, usando 0,0 como fallback`, store.coordinates);
        latitude = 0;
        longitude = 0;
      }

      // Asegurar límites válidos
      if (latitude > 90 || latitude < -90 || longitude > 180 || longitude < -180) {
        console.warn(`Tienda ${store?.name || store?._id} tiene coordenadas fuera de rango, comprobando intercambio de valores...`, { latitude, longitude });
        // Intentar intercambio
        if (longitude >= -90 && longitude <= 90 && latitude >= -180 && latitude <= 180) {
          const tmp = latitude;
          latitude = longitude;
          longitude = tmp;
          console.warn(`Intercambiadas las coordenadas para tienda ${store?.name || store?._id}`, { latitude, longitude });
        }
      }

      return {
        ...store,
        contact: store.contact || { phone: 'Teléfono no disponible', email: '', manager: '' },
        address: store.address || { street: '', city: '', state: '', postalCode: '', country: 'México' },
        coordinates: { latitude, longitude },
        operatingHours: store.operatingHours || {},
        isOpen: store.isOpen ?? true,
        highDemandMode: store.highDemandMode ?? store.serviceTypes?.onDemand ?? false,
        averageDeliveryTime: store.averageDeliveryTime || 1,
        serviceTypes: {
          delivery: store.serviceTypes?.delivery ?? true,
          pickup: store.serviceTypes?.pickup ?? true,
          deliveryRadius: store.serviceTypes?.deliveryRadius ?? 10,
          minimumOrderDelivery: store.serviceTypes?.minimumOrderDelivery ?? 100,
          onDemand: store.highDemandMode ?? store.serviceTypes?.onDemand ?? false,
          onDemandExtraMinutes: store.serviceTypes?.onDemandExtraMinutes ?? 15,
        },
      } as AffiliateStore;
    });

    // Si no hay tiendas en Sanity, usar datos mock de Pedro Escobedo
    if (stores.length === 0) {
      console.log('No hay tiendas en Sanity, usando tiendas mock de Pedro Escobedo');
      stores = [
        {
          _id: 'mock-pe-centro',
          name: 'Tienda Centro Pedro Escobedo',
          storeId: 'PE-CENTRO-001',
          address: {
            street: 'Calle Hidalgo 15, Centro',
            city: 'Pedro Escobedo',
            state: 'Querétaro',
            postalCode: '76240',
            country: 'México',
          },
          coordinates: {
            latitude: 20.5089,
            longitude: -100.1456,
          },
          contact: {
            phone: '+52 442 123 4567',
            email: 'centro.pe@tiendaafiliada.com',
            manager: 'María González',
          },
          operatingHours: {
            monday: '8:00 - 19:00',
            tuesday: '8:00 - 19:00',
            wednesday: '8:00 - 19:00',
            thursday: '8:00 - 19:00',
            friday: '8:00 - 19:00',
            saturday: '8:00 - 17:00',
            sunday: '9:00 - 15:00',
          },
          isActive: true,
          isOpen: true,
          highDemandMode: false,
          capacity: 80,
          averageDeliveryTime: 1,
          deliveryTimeMin: 10,
          deliveryTimeMax: 10,
          serviceTypes:           {
                    "delivery": true,
                    "pickup": true,
                    "deliveryRadius": 15,
                    "minimumOrderDelivery": 150
          },
        },
        {
          _id: 'mock-pe-plaza',
          name: 'Tienda Plaza San Miguel',
          storeId: 'PE-PLAZA-002',
          address: {
            street: 'Av. Constitución 45, Col. San Miguel',
            city: 'Pedro Escobedo',
            state: 'Querétaro',
            postalCode: '76240',
            country: 'México',
          },
          coordinates: {
            latitude: 20.5125,
            longitude: -100.1423,
          },
          contact: {
            phone: '+52 442 234 5678',
            email: 'plaza.pe@tiendaafiliada.com',
            manager: 'Carlos Ramírez',
          },
          operatingHours: {
            monday: '9:00 - 20:00',
            tuesday: '9:00 - 20:00',
            wednesday: '9:00 - 20:00',
            thursday: '9:00 - 20:00',
            friday: '9:00 - 20:00',
            saturday: '9:00 - 18:00',
            sunday: '10:00 - 16:00',
          },
          isActive: true,
          isOpen: true,
          highDemandMode: false,
          capacity: 60,
          averageDeliveryTime: 1,
          deliveryTimeMin: 10,
          deliveryTimeMax: 10,
          serviceTypes:           {
                    "delivery": true,
                    "pickup": true,
                    "deliveryRadius": 12,
                    "minimumOrderDelivery": 100
          },
        },
        {
          _id: 'mock-pe-barrio',
          name: 'Tienda Barrio Alto',
          storeId: 'PE-BARRIO-003',
          address: {
            street: 'Calle Morelos 78, Barrio Alto',
            city: 'Pedro Escobedo',
            state: 'Querétaro',
            postalCode: '76243',
            country: 'México',
          },
          coordinates: {
            latitude: 20.5156,
            longitude: -100.1389,
          },
          contact: {
            phone: '+52 442 345 6789',
            email: 'barrio.pe@tiendaafiliada.com',
            manager: 'Ana López',
          },
          operatingHours: {
            monday: '8:30 - 18:30',
            tuesday: '8:30 - 18:30',
            wednesday: '8:30 - 18:30',
            thursday: '8:30 - 18:30',
            friday: '8:30 - 18:30',
            saturday: '8:30 - 16:00',
            sunday: 'Cerrado',
          },
          isActive: true,
          isOpen: true,
          highDemandMode: false,
          capacity: 45,
          averageDeliveryTime: 1,
          deliveryTimeMin: 10,
          deliveryTimeMax: 10,
          serviceTypes:           {
                    "delivery": false,
                    "pickup": true,
                    "deliveryRadius": 0,
                    "minimumOrderDelivery": 0
          },
        }
      ];
    }

    // Encontrar la tienda más cercana
    console.log(`Buscando tienda más cercana entre ${stores.length} tiendas disponibles`);
    console.log('Dirección del cliente:', JSON.stringify(customerAddress, null, 2));
    console.log('Primera tienda de ejemplo:', JSON.stringify(stores[0], null, 2));
    
    const nearestStore: StoreWithDistance = await findNearestStore(
      customerAddress,
      stores,
      useGoogleMaps
    );
    
    console.log('Tienda más cercana encontrada:', JSON.stringify(nearestStore, null, 2));

    // Validar que nearestStore tenga la estructura mínima requerida
    if (!nearestStore || !nearestStore.address) {
      console.error('Estructura de tienda inválida:', nearestStore);
      return NextResponse.json(
        { error: 'Error en la estructura de datos de la tienda' },
        { status: 500 }
      );
    }

    // Respuesta exitosa con validaciones
    return NextResponse.json({
      success: true,
      data: {
        stores: [nearestStore], // Devolver como array para compatibilidad
        store: nearestStore,
        userCoordinates: nearestStore.userCoordinates || null,
        summary: {
          storeName: nearestStore.name || 'Tienda sin nombre',
          distance: `${nearestStore.distanceKm || 0} km`,
          estimatedDelivery: nearestStore.estimatedDeliveryDate?.toLocaleDateString('es-MX', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }) || 'Fecha no disponible',
          address: `${nearestStore.address?.street || ''}, ${nearestStore.address?.city || ''}, ${nearestStore.address?.state || ''}`,
          phone: nearestStore.contact?.phone || 'Teléfono no disponible',
        }
      }
    });

  } catch (error) {
    console.error('Error en /api/nearest-store:', error);
    
    return NextResponse.json(
      { 
        error: 'Error interno del servidor',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}

// Endpoint GET para obtener todas las tiendas (útil para debugging)
export async function GET(request: NextRequest) {
  try {
    console.log('GET /api/nearest-store - Obteniendo tiendas...');
    let stores: AffiliateStore[] = [];
    
    try {
      stores = await client.fetch(STORES_QUERY);
    } catch (sanityError) {
      console.log('Error obteniendo tiendas de Sanity, usando datos mock:', sanityError);
    }

    // Validar y limpiar datos de tiendas de Sanity
    stores = stores.map(store => ({
      ...store,
      contact: store.contact || { phone: 'Teléfono no disponible', email: '', manager: '' },
      address: store.address || { street: '', city: '', state: '', postalCode: '', country: 'México' },
      coordinates: store.coordinates || { latitude: 0, longitude: 0 },
      operatingHours: store.operatingHours || {},
      isOpen: store.isOpen ?? true,
      highDemandMode: store.highDemandMode ?? store.serviceTypes?.onDemand ?? false,
      averageDeliveryTime: store.averageDeliveryTime || 1,
      serviceTypes: {
        delivery: store.serviceTypes?.delivery ?? true,
        pickup: store.serviceTypes?.pickup ?? true,
        deliveryRadius: store.serviceTypes?.deliveryRadius ?? 10,
        minimumOrderDelivery: store.serviceTypes?.minimumOrderDelivery ?? 100,
        onDemand: store.highDemandMode ?? store.serviceTypes?.onDemand ?? false,
        onDemandExtraMinutes: store.serviceTypes?.onDemandExtraMinutes ?? 15,
      }
    }));

    // Permitir filtrar por storeId desde la query string (p.ej. ?filterStoreId=abc123)
    // En runtime de Next.js, las URLs se manejan a través de request.nextUrl


    // Si no hay tiendas en Sanity, usar datos mock de Pedro Escobedo
    if (stores.length === 0) {
      console.log('No hay tiendas en Sanity, usando tiendas mock de Pedro Escobedo');
      stores = [
        {
          _id: 'mock-pe-centro',
          name: 'Tienda Centro Pedro Escobedo',
          storeId: 'PE-CENTRO-001',
          address: {
            street: 'Calle Hidalgo 15, Centro',
            city: 'Pedro Escobedo',
            state: 'Querétaro',
            postalCode: '76240',
            country: 'México',
          },
          coordinates: {
            latitude: 20.5089,
            longitude: -100.1456,
          },
          contact: {
            phone: '+52 442 123 4567',
            email: 'centro.pe@tiendaafiliada.com',
            manager: 'María González',
          },
          operatingHours: {
            monday: '8:00 - 19:00',
            tuesday: '8:00 - 19:00',
            wednesday: '8:00 - 19:00',
            thursday: '8:00 - 19:00',
            friday: '8:00 - 19:00',
            saturday: '8:00 - 17:00',
            sunday: '9:00 - 15:00',
          },
          isActive: true,
          isOpen: true,
          highDemandMode: false,
          capacity: 80,
          averageDeliveryTime: 1,
          deliveryTimeMin: 10,
          deliveryTimeMax: 10,
          serviceTypes:           {
                    "delivery": true,
                    "pickup": true,
                    "deliveryRadius": 15,
                    "minimumOrderDelivery": 150
          },
        },
        {
          _id: 'mock-pe-plaza',
          name: 'Tienda Plaza San Miguel',
          storeId: 'PE-PLAZA-002',
          address: {
            street: 'Av. Constitución 45, Col. San Miguel',
            city: 'Pedro Escobedo',
            state: 'Querétaro',
            postalCode: '76240',
            country: 'México',
          },
          coordinates: {
            latitude: 20.5125,
            longitude: -100.1423,
          },
          contact: {
            phone: '+52 442 234 5678',
            email: 'plaza.pe@tiendaafiliada.com',
            manager: 'Carlos Ramírez',
          },
          operatingHours: {
            monday: '9:00 - 20:00',
            tuesday: '9:00 - 20:00',
            wednesday: '9:00 - 20:00',
            thursday: '9:00 - 20:00',
            friday: '9:00 - 20:00',
            saturday: '9:00 - 18:00',
            sunday: '10:00 - 16:00',
          },
          isActive: true,
          isOpen: true,
          highDemandMode: false,
          capacity: 60,
          averageDeliveryTime: 1,
          deliveryTimeMin: 10,
          deliveryTimeMax: 10,
          serviceTypes:           {
                    "delivery": true,
                    "pickup": true,
                    "deliveryRadius": 12,
                    "minimumOrderDelivery": 100
          },
        },
        {
          _id: 'mock-pe-barrio',
          name: 'Tienda Barrio Alto',
          storeId: 'PE-BARRIO-003',
          address: {
            street: 'Calle Morelos 78, Barrio Alto',
            city: 'Pedro Escobedo',
            state: 'Querétaro',
            postalCode: '76243',
            country: 'México',
          },
          coordinates: {
            latitude: 20.5156,
            longitude: -100.1389,
          },
          contact: {
            phone: '+52 442 345 6789',
            email: 'barrio.pe@tiendaafiliada.com',
            manager: 'Ana López',
          },
          operatingHours: {
            monday: '8:30 - 18:30',
            tuesday: '8:30 - 18:30',
            wednesday: '8:30 - 18:30',
            thursday: '8:30 - 18:30',
            friday: '8:30 - 18:30',
            saturday: '8:30 - 16:00',
            sunday: 'Cerrado',
          },
          isActive: true,
          isOpen: true,
          highDemandMode: false,
          capacity: 45,
          averageDeliveryTime: 1,
          deliveryTimeMin: 10,
          deliveryTimeMax: 10,
          serviceTypes:           {
                    "delivery": false,
                    "pickup": true,
                    "deliveryRadius": 0,
                    "minimumOrderDelivery": 0
          },
        }
      ];
    }
    
    // Aplicar filtro por tienda si se proporciona filterStoreId en la query
    try {
      const filterStoreId = request.nextUrl.searchParams.get('filterStoreId');
      if (filterStoreId) {
        stores = stores.filter(s => s._id === filterStoreId);
        console.log(`Aplicando filtro filterStoreId=${filterStoreId}, tiendas resultantes: ${stores.length}`);
      }
    } catch {
      console.log('No se pudo leer filterStoreId de la request');
    }

    console.log(`Devolviendo ${stores.length} tiendas validadas`);
    
    return NextResponse.json({
      success: true,
      data: {
        stores,
        count: stores.length
      }
    });
  } catch (error) {
    console.error('Error obteniendo tiendas:', error);
    
    return NextResponse.json(
      { error: 'Error al obtener tiendas afiliadas', details: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
