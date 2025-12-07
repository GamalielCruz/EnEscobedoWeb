/**
 * Verifica si una tienda está abierta basándose en sus horarios de operación
 */
export function isStoreOpen(operatingHours?: {
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
  saturday?: string;
  sunday?: string;
}): { isOpen: boolean; closingTime?: string; openingTime?: string } {
  if (!operatingHours) {
    return { isOpen: false };
  }

  const now = new Date();
  const currentDay = now.toLocaleDateString('es-MX', { weekday: 'long' }).toLowerCase();
  const currentTime = now.getHours() * 60 + now.getMinutes(); // minutos desde medianoche

  // Mapear días en español a inglés
  const dayMap: { [key: string]: keyof typeof operatingHours } = {
    'lunes': 'monday',
    'martes': 'tuesday',
    'miércoles': 'wednesday',
    'jueves': 'thursday',
    'viernes': 'friday',
    'sábado': 'saturday',
    'domingo': 'sunday',
  };

  const dayKey = dayMap[currentDay];
  if (!dayKey) {
    return { isOpen: false };
  }

  const todayHours = operatingHours[dayKey];
  if (!todayHours || todayHours.toLowerCase() === 'cerrado') {
    return { isOpen: false };
  }

  // Parsear horario (formato: "9:00 - 18:00" o "09:00 - 18:00")
  const hoursMatch = todayHours.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!hoursMatch) {
    return { isOpen: false };
  }

  const [, openHour, openMin, closeHour, closeMin] = hoursMatch;
  const openingTime = parseInt(openHour) * 60 + parseInt(openMin);
  const closingTime = parseInt(closeHour) * 60 + parseInt(closeMin);

  const isOpen = currentTime >= openingTime && currentTime < closingTime;

  return {
    isOpen,
    closingTime: `${closeHour}:${closeMin}`,
    openingTime: `${openHour}:${openMin}`,
  };
}

/**
 * Obtiene el texto de estado de la tienda
 */
export function getStoreStatusText(operatingHours?: {
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
  saturday?: string;
  sunday?: string;
}): string {
  const { isOpen, closingTime, openingTime } = isStoreOpen(operatingHours);
  
  if (isOpen && closingTime) {
    return `Abierto • Cierra a las ${closingTime}`;
  } else if (!isOpen && openingTime) {
    return `Cerrado • Abre a las ${openingTime}`;
  } else if (!isOpen) {
    return 'Cerrado';
  }
  
  return 'Abierto';
}
