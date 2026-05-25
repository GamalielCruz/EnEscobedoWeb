// Tipos para el sistema Click & Collect
export interface CustomerAddress {
  street: string;
  city: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface CustomerAddressWithCoords extends CustomerAddress {
  latitude?: number;
  longitude?: number;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface AffiliateStore {
  _id: string;
  name: string;
  storeId: string;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  coordinates: Coordinates;
  contact: {
    phone: string;
    email?: string;
    manager?: string;
  };
  operatingHours: {
    [key: string]: string;
  };
  isActive: boolean;
  capacity: number;
  averageDeliveryTime: number;
  deliveryTimeMin?: number;
  deliveryTimeMax?: number;
  serviceTypes?: {
    delivery: boolean;
    pickup: boolean;
    deliveryRadius?: number;
    minimumOrderDelivery?: number;
    onDemand?: boolean;
    onDemandExtraMinutes?: number;
  };
}

export interface StoreWithDistance extends AffiliateStore {
  distanceKm: number;
  estimatedDeliveryDate: Date;
  userCoordinates?: Coordinates;
}

/**
 * Calcula la distancia entre dos puntos usando la fórmula de Haversine
 * @param lat1 Latitud del primer punto
 * @param lon1 Longitud del primer punto
 * @param lat2 Latitud del segundo punto
 * @param lon2 Longitud del segundo punto
 * @returns Distancia en kilómetros
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radio de la Tierra en kilómetros
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 100) / 100; // Redondear a 2 decimales
}

/**
 * Convierte grados a radianes
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Geocodifica una dirección usando la API de Google Maps
 * @param address Dirección del cliente
 * @returns Coordenadas de la dirección
 */
export async function geocodeAddress(address: CustomerAddress): Promise<Coordinates> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  
  if (!apiKey || apiKey === 'TU_API_KEY_AQUI') {
    throw new Error('Google Maps API key no configurada correctamente');
  }

  // Construir la dirección completa
  const fullAddress = [
    address.street,
    address.city,
    address.state,
    address.postalCode,
    address.country || 'México'
  ].filter(Boolean).join(', ');

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${apiKey}`;

  try {
    console.log(`Geocodificando con Google Maps: ${fullAddress}`);
    const response = await fetch(url);
    const data = await response.json();

    console.log(`Google Maps response status: ${data.status}`);

    if (data.status === 'REQUEST_DENIED') {
      throw new Error(`Google Maps API key inválida o sin permisos. Status: ${data.status}. Error: ${data.error_message || 'Sin mensaje de error'}`);
    }

    if (data.status === 'OVER_QUERY_LIMIT') {
      throw new Error('Límite de consultas de Google Maps excedido');
    }

    if (data.status !== 'OK' || !data.results.length) {
      throw new Error(`No se encontraron resultados. Status: ${data.status}`);
    }

    const location = data.results[0].geometry.location;
    console.log(`Coordenadas obtenidas: ${location.lat}, ${location.lng}`);
    
    return {
      latitude: location.lat,
      longitude: location.lng,
    };
  } catch (error) {
    console.error('Error en geocodificación con Google Maps:', error);
    throw error; // Re-lanzar el error para que el fallback funcione
  }
}

/**
 * Geocodificación alternativa usando OpenStreetMap (gratuita)
 * @param address Dirección del cliente
 * @returns Coordenadas de la dirección
 */
export async function geocodeAddressOSM(address: CustomerAddress): Promise<Coordinates> {
  // Fallback con coordenadas aproximadas para direcciones comunes
  const fallbackCoordinates: Record<string, Coordinates> = {
    // Querétaro (principal)
    'pedro escobedo': { latitude: 20.5089, longitude: -100.1456 },
    'querétaro': { latitude: 20.5888, longitude: -100.3899 },
    'santiago de querétaro': { latitude: 20.5888, longitude: -100.3899 },
    'qro': { latitude: 20.5888, longitude: -100.3899 },
    
    // Otras ciudades (secundarias)
    'ciudad de méxico': { latitude: 19.4326, longitude: -99.1332 },
    'cdmx': { latitude: 19.4326, longitude: -99.1332 },
    'guadalajara': { latitude: 20.6597, longitude: -103.3496 },
    'monterrey': { latitude: 25.6515, longitude: -100.3691 },
  };

  // Verificar si tenemos coordenadas de fallback
  const cityKey = address.city.toLowerCase();
  const stateKey = address.state?.toLowerCase() || '';
  
  if (fallbackCoordinates[cityKey] || fallbackCoordinates[stateKey]) {
    console.log(`Usando coordenadas de fallback para: ${address.city}`);
    return fallbackCoordinates[cityKey] || fallbackCoordinates[stateKey];
  }

  // Construir la dirección completa
  const fullAddress = [
    address.street,
    address.city,
    address.state,
    address.postalCode,
    address.country || 'México'
  ].filter(Boolean).join(', ');

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1&countrycodes=mx`;

  try {
    console.log(`Geocodificando: ${fullAddress}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ClickCollectApp/1.0', // Requerido por Nominatim
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`Respuesta de geocodificación:`, data);

    if (!data.length) {
      // Si no encontramos resultados, usar coordenadas de Pedro Escobedo como fallback
      console.log('No se encontraron resultados, usando coordenadas de Pedro Escobedo como fallback');
      return { latitude: 20.5089, longitude: -100.1456 };
    }

    return {
      latitude: parseFloat(data[0].lat),
      longitude: parseFloat(data[0].lon),
    };
  } catch (error) {
    console.error('Error en geocodificación OSM:', error);
    // En caso de error, usar coordenadas de Pedro Escobedo
    console.log('Error en geocodificación, usando coordenadas de Pedro Escobedo como fallback');
    return { latitude: 20.5089, longitude: -100.1456 };
  }
}

/**
 * Encuentra la tienda más cercana a una dirección
 * @param customerAddress Dirección del cliente
 * @param stores Lista de tiendas afiliadas
 * @param useGoogleMaps Si usar Google Maps o OpenStreetMap para geocodificación
 * @returns Tienda más cercana con información de distancia
 */
export async function findNearestStore(
  customerAddress: CustomerAddress,
  stores: AffiliateStore[],
  useGoogleMaps: boolean = false
): Promise<StoreWithDistance> {
  // Filtrar solo tiendas activas
  const activeStores = stores.filter(store => store.isActive);
  
  if (activeStores.length === 0) {
    throw new Error('No hay tiendas activas disponibles');
  }

  // Geocodificar la dirección del cliente con fallback automático
  let customerCoords: Coordinates;
  
  if (useGoogleMaps) {
    try {
      customerCoords = await geocodeAddress(customerAddress);
      console.log('Geocodificación exitosa con Google Maps');
    } catch (googleError) {
      console.log('Google Maps falló, usando OpenStreetMap como fallback:', googleError);
      customerCoords = await geocodeAddressOSM(customerAddress);
    }
  } else {
    customerCoords = await geocodeAddressOSM(customerAddress);
  }

  // Calcular distancias y agregar información de entrega
  const storesWithDistance: StoreWithDistance[] = activeStores.map(store => {
    const distanceKm = calculateDistance(
      customerCoords.latitude,
      customerCoords.longitude,
      store.coordinates.latitude,
      store.coordinates.longitude
    );

    // Calcular fecha estimada de entrega usando los nuevos campos de tiempo en minutos
    const estimatedDeliveryDate = new Date();
    
    // Si la tienda tiene tiempos configurados en minutos, usarlos
    if (store.deliveryTimeMin != null && store.deliveryTimeMax != null) {
      // Usar el tiempo promedio en minutos
      const avgTimeMinutes = Math.round((store.deliveryTimeMin + store.deliveryTimeMax) / 2);
      estimatedDeliveryDate.setMinutes(estimatedDeliveryDate.getMinutes() + avgTimeMinutes);
    } else {
      // Fallback: usar el tiempo promedio en días (comportamiento anterior)
      estimatedDeliveryDate.setDate(estimatedDeliveryDate.getDate() + store.averageDeliveryTime);
    }

    return {
      ...store,
      distanceKm,
      estimatedDeliveryDate,
    };
  });

  // Ordenar por distancia y retornar la más cercana
  storesWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);
  
  const nearestStore = storesWithDistance[0];
  
  // Agregar las coordenadas del usuario a la respuesta
  return {
    ...nearestStore,
    userCoordinates: customerCoords
  };
}

/**
 * Genera un código único de recogida
 * @returns Código de 8 caracteres alfanumérico
 */
export function generatePickupCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Calcula el tiempo estimado de entrega considerando días laborables
 * @param deliveryDays Días de entrega base
 * @returns Fecha estimada considerando fines de semana
 */
export function calculateEstimatedDelivery(deliveryDays: number): Date {
  const deliveryDate = new Date();
  let daysAdded = 0;
  
  while (daysAdded < deliveryDays) {
    deliveryDate.setDate(deliveryDate.getDate() + 1);
    
    // Solo contar días laborables (lunes a viernes)
    const dayOfWeek = deliveryDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0 = domingo, 6 = sábado
      daysAdded++;
    }
  }
  
  return deliveryDate;
}
