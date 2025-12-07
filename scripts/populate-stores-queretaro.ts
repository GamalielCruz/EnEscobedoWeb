/**
 * Script para poblar la base de datos con tiendas afiliadas en Pedro Escobedo, Querétaro
 * Ejecutar con: npx tsx scripts/populate-stores-queretaro.ts
 */

// Cargar variables de entorno
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@sanity/client';

// Configuración directa del cliente
const client = createClient({
  projectId: 'kgklfrat',
  dataset: 'production',
  apiVersion: '2025-07-25',
  token: 'skTKqpKJegWPIvjfxNKsTViWyZf3kWj45UhoAlj1nHiAEYI5FyD0tXKEjNPpH7t9HeI7LE0DL77ZDmKdBNmbY3cPpU02Nsx4Hx9KMwqCLIwRSjMpwMwg76oT6AGHK7tXvYMrOjPFldQ8H9aKQvfLC6E5svNz3yLkfZwbiT2iF3FGoPGuMIIC',
  useCdn: false,
});

const pedroEscobedoStores = [
  {
    _type: 'affiliateStore',
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
    capacity: 80,
    averageDeliveryTime: 1, // 1 día por ser local
  },
  {
    _type: 'affiliateStore',
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
    capacity: 60,
    averageDeliveryTime: 1,
  },
  {
    _type: 'affiliateStore',
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
    capacity: 45,
    averageDeliveryTime: 1,
  },
  {
    _type: 'affiliateStore',
    name: 'Tienda La Estación',
    storeId: 'PE-ESTACION-004',
    address: {
      street: 'Av. Ferrocarril 123, La Estación',
      city: 'Pedro Escobedo',
      state: 'Querétaro',
      postalCode: '76241',
      country: 'México',
    },
    coordinates: {
      latitude: 20.5034,
      longitude: -100.1512,
    },
    contact: {
      phone: '+52 442 456 7890',
      email: 'estacion.pe@tiendaafiliada.com',
      manager: 'Roberto Hernández',
    },
    operatingHours: {
      monday: '7:00 - 19:00',
      tuesday: '7:00 - 19:00',
      wednesday: '7:00 - 19:00',
      thursday: '7:00 - 19:00',
      friday: '7:00 - 19:00',
      saturday: '7:00 - 17:00',
      sunday: '8:00 - 14:00',
    },
    isActive: true,
    capacity: 70,
    averageDeliveryTime: 1,
  },
  {
    _type: 'affiliateStore',
    name: 'Tienda El Pueblito',
    storeId: 'PE-PUEBLITO-005',
    address: {
      street: 'Calle Juárez 56, El Pueblito',
      city: 'Pedro Escobedo',
      state: 'Querétaro',
      postalCode: '76242',
      country: 'México',
    },
    coordinates: {
      latitude: 20.5067,
      longitude: -100.1378,
    },
    contact: {
      phone: '+52 442 567 8901',
      email: 'pueblito.pe@tiendaafiliada.com',
      manager: 'Laura Martínez',
    },
    operatingHours: {
      monday: '8:00 - 18:00',
      tuesday: '8:00 - 18:00',
      wednesday: '8:00 - 18:00',
      thursday: '8:00 - 18:00',
      friday: '8:00 - 18:00',
      saturday: '8:00 - 16:00',
      sunday: '9:00 - 15:00',
    },
    isActive: true,
    capacity: 50,
    averageDeliveryTime: 1,
  },
  // Tienda adicional en Querétaro capital para comparación
  {
    _type: 'affiliateStore',
    name: 'Tienda Querétaro Centro',
    storeId: 'QRO-CENTRO-006',
    address: {
      street: 'Calle 5 de Mayo 89, Centro Histórico',
      city: 'Santiago de Querétaro',
      state: 'Querétaro',
      postalCode: '76000',
      country: 'México',
    },
    coordinates: {
      latitude: 20.5888,
      longitude: -100.3899,
    },
    contact: {
      phone: '+52 442 678 9012',
      email: 'centro.qro@tiendaafiliada.com',
      manager: 'José Sánchez',
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
    capacity: 100,
    averageDeliveryTime: 2, // 2 días por estar más lejos
  },
];

async function populateQueretaroStores() {
  try {
    console.log('🏪 Iniciando población de tiendas en Pedro Escobedo, Querétaro...');
    
    // Verificar si ya existen tiendas
    const existingStores = await client.fetch('*[_type == "affiliateStore"]');
    
    if (existingStores.length > 0) {
      console.log(`⚠️  Ya existen ${existingStores.length} tiendas en la base de datos.`);
      console.log('Las nuevas tiendas se agregarán a las existentes.');
    }

    // Crear las tiendas
    const results = await Promise.all(
      pedroEscobedoStores.map(store => client.create(store))
    );

    console.log(`✅ Se crearon ${results.length} tiendas afiliadas exitosamente:`);
    
    results.forEach((store, index) => {
      console.log(`   ${index + 1}. ${store.name} (${store.storeId}) - ${store.address.city}`);
    });

    console.log('\n📍 Ubicaciones creadas en Querétaro:');
    console.log('   • Pedro Escobedo: 5 tiendas');
    console.log('   • Santiago de Querétaro: 1 tienda');
    
    console.log('\n🎯 Coordenadas de Pedro Escobedo:');
    console.log('   • Centro: 20.5089, -100.1456');
    console.log('   • Todas las tiendas están en un radio de ~3km');
    
    console.log('\n🎉 ¡Población completada! Ahora puedes probar el sistema Click & Collect con Google Maps.');
    console.log('💡 Direcciones de prueba sugeridas:');
    console.log('   - Calle Hidalgo 10, Pedro Escobedo, Querétaro');
    console.log('   - Av. Constitución 30, Pedro Escobedo, Querétaro');
    console.log('   - Calle Morelos 50, Pedro Escobedo, Querétaro');
    
  } catch (error) {
    console.error('❌ Error poblando tiendas:', error);
    process.exit(1);
  }
}

// Ejecutar solo si es llamado directamente
if (require.main === module) {
  populateQueretaroStores();
}

export { populateQueretaroStores, pedroEscobedoStores };