/**
 * Estilos y colores de marca para el mapa del repartidor.
 *
 * Paleta de facto de ElMenu (ver Fase 0): navy #09193B + rojo #EB1902.
 * Este JSON es el ESTILO DE MARCA: se importa tal cual (pestaña JSON) al
 * crear el Map ID vectorial en Cloud Console, y vive asociado a ese Map ID.
 * La referencia inline de DRIVE_MAP_STYLES en la página del repartidor es un
 * fallback TRANSITORIO solo mientras NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID no
 * exista; el estado final es Map ID + estilo de marca + rotación siempre
 * juntos.
 *
 * La ruta vial se dibuja en azul ROUTE_BLUE para que destaque sobre el mapa
 * claro; el puck del repartidor usa el mismo azul.
 */

export const BRAND_NAVY = "#09193B";
export const BRAND_RED = "#EB1902";
export const BRAND_RED_DARK = "#850C22";
/** Línea de ruta y puck del repartidor (contraste sobre el mapa claro). */
export const ROUTE_BLUE = "#3B82F6";
export const PICKUP_ORANGE = "#F97316";
export const DELIVERY_RED = "#EF4444";

/**
 * Estilo claro "de navegación": fondo neutro, vías blancas con perfil sutil,
 * POI/transporte fuera para que la ruta azul y los marcadores sean lo único
 * llamativo de la pantalla mientras el conductor maneja.
 */
export const DRIVE_MAP_STYLES: google.maps.MapTypeStyle[] = [
  // Base
  { elementType: "geometry", stylers: [{ color: "#eef1f5" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5b6675" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },

  // Agua
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cdd9e8" }] },
  { featureType: "water", elementType: "labels", stylers: [{ visibility: "off" }] },

  // Parques / áreas verdes
  { featureType: "park", elementType: "geometry", stylers: [{ color: "#dbe7d8" }] },
  { featureType: "park", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#eef1f5" }] },

  // Vías: relleno blanco con perfil gris claro
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#d3dae3" }, { weight: 1 }],
  },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#4d5a6b" }] },
  { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },

  // Autopistas: leve acento ámbar para distinguirlas de las calles
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#f9e9b8" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#e6c96f" }],
  },

  // Límites administrativos (municipios, estados)
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#c9d0d9" }],
  },
  {
    featureType: "administrative",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b7686" }],
  },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#3d4a5c" }],
  },

  // Transporte público fuera: no aporta a un repartidor manejando
  { featureType: "transit", stylers: [{ visibility: "off" }] },

  // POI fuera (negocios, atracciones): menos ruido sobre el mapa
  { featureType: "poi", stylers: [{ visibility: "off" }] },
];