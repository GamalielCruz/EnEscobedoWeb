const fs = require('fs');

// Leer el schema extraído
const schema = JSON.parse(fs.readFileSync('schema.json', 'utf8'));

// Buscar el tipo affiliateStore
const affiliateStoreType = schema.find(type => type.name === 'affiliateStore');

if (!affiliateStoreType) {
  console.log('❌ No se encontró el tipo affiliateStore');
  console.log('Tipos disponibles:', schema.map(t => t.name));
  process.exit(1);
}

console.log('✅ Tipo affiliateStore encontrado');

// Verificar que tenga el campo serviceTypes
const serviceTypesField = affiliateStoreType.attributes.serviceTypes;

if (!serviceTypesField) {
  console.log('❌ Campo serviceTypes no encontrado en affiliateStore');
  console.log('Campos disponibles:', Object.keys(affiliateStoreType.attributes));
  process.exit(1);
}

console.log('✅ Campo serviceTypes encontrado');
console.log('Estructura del campo serviceTypes:');
console.log(JSON.stringify(serviceTypesField, null, 2));

// Verificar subcampos
const serviceTypesObject = serviceTypesField.value;
if (serviceTypesObject && serviceTypesObject.attributes) {
  const subfields = Object.keys(serviceTypesObject.attributes);
  console.log('✅ Subcampos encontrados:', subfields);
  
  const expectedFields = ['delivery', 'pickup', 'deliveryRadius', 'minimumOrderDelivery'];
  const missingFields = expectedFields.filter(field => !subfields.includes(field));
  
  if (missingFields.length > 0) {
    console.log('❌ Subcampos faltantes:', missingFields);
  } else {
    console.log('✅ Todos los subcampos esperados están presentes');
  }
} else {
  console.log('❌ No se encontraron subcampos en serviceTypes');
}

console.log('\n🎉 Verificación del schema completada');