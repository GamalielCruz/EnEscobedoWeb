/**
 * Script para poblar la base de datos con tiendas afiliadas de ejemplo
 * Ejecutar con: npx tsx scripts/populate-stores-direct.ts
 */

import { createClient } from '@sanity/client';

// Configuración directa del cliente
const client = createClient({
  projectId: 'kgklfrat',
  dataset: 'production',
  apiVersion: '2025-07-25',
  token: 'skTKqpKJegWPIvjfxNKsTViWyZf3kWj45UhoAlj1nHiAEYI5FyD0tXKEjNPpH7t9HeI7LE0DL77ZDmKdBNmbY3cPpU02Nsx4Hx9KMwqCLIwRSjMpwMwg76oT6AGHK7tXvYMrOjPFldQ8H9aKQvfLC6E5svNz3yLkfZwbiT2iF3FGoPGuMIIC',
  useCdn: false,
});

const sampleStores = [
  {
    _type: 'affiliateStore',
    name: 'Tienda Centro Histórico',
    storeId: 'STORE-001',
    address: {
      street: 'Av. Francisco I. Madero 17',
      city: 'Ciudad de México',
      state: 'CDMX',
      postalCode: '06000',
      country: 'México',
    },
    coordinates: {
      latitude: 19.4326,
      longitude: -99.1332,
    },
    contact: {
      phone: '+52 55 1234 5678',
      email: 'centro@tiendaafiliada.com',
      manager: 'Ana García',
    },
    operatingHours: {
      monday: '9:00 - 19:00',
      tuesday: '9:00 - 19:00',
      wednesday: '9:00 - 19:00',
      thursday: '9:00 - 19:00',
      friday: '9:00 - 19:00',
      saturday: '9:00 - 17:00',
      sunday: '10:00 - 15:00',
    },
    isActive: true,
    capacity: 100,
    averageDeliveryTime: 2,
  },
  {
    _type: 'affiliateStore',
    name: 'Tienda Polanco',
    storeId: 'STORE-002',
    address: {
      street: 'Av. Presidente Masaryk 111',
      city: 'Ciudad de México',
      state: 'CDMX',
      postalCode: '11560',
      country: 'México',
    },
    coordinates: {
      latitude: 19.4284,
      longitude: -99.1918,
    },
    contact: {
      phone: '+52 55 2345 6789',
      email: 'polanco@tiendaafiliada.com',
      manager: 'Carlos Rodríguez',
    },
    operatingHours: {
      monday: '10:00 - 20:00',
      tuesday: '10:00 - 20:00',
      wednesday: '10:00 - 20:00',
      thursday: '10:00 - 20:00',
      friday: '10:00 - 20:00',
      saturday: '10:00 - 18:00',
      sunday: 'Cerrado',
    },
    isActive: true,
    capacity: 75,
    averageDeliveryTime: 3,
  },
  {
    _type: 'affiliateStore',
    name: 'Tienda Roma Norte',
    storeId: 'STORE-003',
    address: {
      street: 'Av. Álvaro Obregón 286',
      city: 'Ciudad de México',
      state: 'CDMX',
      postalCode: '06700',
      country: 'México',
    },
    coordinates: {
      latitude: 19.4194,
      longitude: -99.1625,
    },
    contact: {
      phone: '+52 55 3456 7890',
      email: 'roma@tiendaafiliada.com',
      manager: 'María López',
    },
    operatingHours: {
      monday: '9:00 - 18:00',
      tuesday: '9:00 - 18:00',
      wednesday: '9:00 - 18:00',
      thursday: '9:00 - 18:00',
      friday: '9:00 - 18:00',
      saturday: '9:00 - 16:00',
      sunday: 'Cerrado',
    },
    isActive: true,
    capacity: 50,
    averageDeliveryTime: 2,
  },
  {
    _type: 'affiliateStore',
    name: 'Tienda Coyoacán',
    storeId: 'STORE-004',
    address: {
      street: 'Av. Universidad 1330',
      city: 'Ciudad de México',
      state: 'CDMX',
      postalCode: '04100',
      country: 'México',
    },
    coordinates: {
      latitude: 19.3467,
      longitude: -99.1618,
    },
    contact: {
      phone: '+52 55 4567 8901',
      email: 'coyoacan@tiendaafiliada.com',
      manager: 'José Martínez',
    },
    operatingHours: {
      monday: '8:00 - 17:00',
      tuesday: '8:00 - 17:00',
      wednesday: '8:00 - 17:00',
      thursday: '8:00 - 17:00',
      friday: '8:00 - 17:00',
      saturday: '8:00 - 15:00',
      sunday: 'Cerrado',
    },
    isActive: true,
    capacity: 60,
    averageDeliveryTime: 4,
  },
  {
    _type: 'affiliateStore',
    name: 'Tienda Guadalajara Centro',
    storeId: 'STORE-005',
    address: {
      street: 'Av. Juárez 500',
      city: 'Guadalajara',
      state: 'Jalisco',
      postalCode: '44100',
      country: 'México',
    },
    coordinates: {
      latitude: 20.6597,
      longitude: -103.3496,
    },
    contact: {
      phone: '+52 33 1234 5678',
      email: 'gdl@tiendaafiliada.com',
      manager: 'Laura Hernández',
    },
    operatingHours: {
      monday: '9:00 - 19:00',
      tuesday: '9:00 - 19:00',
      wednesday: '9:00 - 19:00',
      thursday: '9:00 - 19:00',
      friday: '9:00 - 19:00',
      saturday: '9:00 - 17:00',
      sunday: '10:00 - 15:00',
    },
    isActive: true,
    capacity: 80,
    averageDeliveryTime: 5,
  },
  {
    _type: 'affiliateStore',
    name: 'Tienda Monterrey San Pedro',
    storeId: 'STORE-006',
    address: {
      street: 'Av. Vasconcelos 150',
      city: 'San Pedro Garza García',
      state: 'Nuevo León',
      postalCode: '66260',
      country: 'México',
    },
    coordinates: {
      latitude: 25.6515,
      longitude: -100.3691,
    },
    contact: {
      phone: '+52 81 2345 6789',
      email: 'mty@tiendaafiliada.com',
      manager: 'Roberto Sánchez',
    },
    operatingHours: {
      monday: '10:00 - 20:00',
      tuesday: '10:00 - 20:00',
      wednesday: '10:00 - 20:00',
      thursday: '10:00 - 20:00',
      friday: '10:00 - 20:00',
      saturday: '10:00 - 18:00',
      sunday: 'Cerrado',
    },
    isActive: true,
    capacity: 90,
    averageDeliveryTime: 4,
  },
];

async function populateStores() {
  try {
    console.log('🏪 Iniciando población de tiendas afiliadas...');
    
    // Verificar si ya existen tiendas
    const existingStores = await client.fetch('*[_type == "affiliateStore"]');
    
    if (existingStores.length > 0) {
      console.log(`⚠️  Ya existen ${existingStores.length} tiendas en la base de datos.`);
      console.log('Continuando con la creación de nuevas tiendas...');
    }

    // Crear las tiendas
    const results = await Promise.all(
      sampleStores.map(store => client.create(store))
    );

    console.log(`✅ Se crearon ${results.length} tiendas afiliadas exitosamente:`);
    
    results.forEach((store, index) => {
      console.log(`   ${index + 1}. ${store.name} (${store.storeId}) - ${store.address.city}`);
    });

    console.log('\n📍 Ubicaciones creadas:');
    console.log('   • Ciudad de México: 4 tiendas');
    console.log('   • Guadalajara: 1 tienda');
    console.log('   • Monterrey: 1 tienda');
    
    console.log('\n🎉 ¡Población completada! Ahora puedes probar el sistema Click & Collect.');
    
  } catch (error) {
    console.error('❌ Error poblando tiendas:', error);
    process.exit(1);
  }
}

// Ejecutar solo si es llamado directamente
if (require.main === module) {
  populateStores();
}

export { populateStores, sampleStores };