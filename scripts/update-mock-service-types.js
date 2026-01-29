const fs = require('fs');
const path = require('path');

// Leer el archivo de la API
const apiFilePath = path.join(__dirname, '../app/api/nearest-store/route.ts');
let content = fs.readFileSync(apiFilePath, 'utf8');

// Definir los serviceTypes para cada tienda mock
const serviceTypesConfigs = {
  'mock-pe-centro': {
    delivery: true,
    pickup: true,
    deliveryRadius: 15,
    minimumOrderDelivery: 150
  },
  'mock-pe-plaza': {
    delivery: true,
    pickup: true,
    deliveryRadius: 12,
    minimumOrderDelivery: 100
  },
  'mock-pe-barrio': {
    delivery: false, // Solo pickup para demostrar la funcionalidad
    pickup: true,
    deliveryRadius: 0,
    minimumOrderDelivery: 0
  }
};

// Función para agregar serviceTypes a una tienda específica
function addServiceTypesToStore(content, storeId, serviceTypes) {
  const regex = new RegExp(
    `(_id: '${storeId}',[\\s\\S]*?deliveryTimeMax: \\d+,)`,
    'g'
  );
  
  const replacement = `$1
          serviceTypes: ${JSON.stringify(serviceTypes, null, 12).replace(/^/gm, '          ')},`;
  
  return content.replace(regex, replacement);
}

// Aplicar las configuraciones
Object.entries(serviceTypesConfigs).forEach(([storeId, serviceTypes]) => {
  content = addServiceTypesToStore(content, storeId, serviceTypes);
});

// Escribir el archivo actualizado
fs.writeFileSync(apiFilePath, content);

console.log('✅ Archivo actualizado con serviceTypes para tiendas mock');
console.log('Configuraciones aplicadas:');
Object.entries(serviceTypesConfigs).forEach(([storeId, config]) => {
  console.log(`- ${storeId}:`, config);
});