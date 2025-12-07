#!/usr/bin/env node

// Script para configurar CORS de Sanity para producción
const { execSync } = require('child_process');

const domains = [
  'https://www.pixelaplastico.com',
  'https://pixelaplastico.com',
  'http://localhost:3000'
];

console.log('🔧 Configurando CORS de Sanity para producción...\n');

domains.forEach((domain, index) => {
  try {
    console.log(`${index + 1}. Agregando: ${domain}`);
    
    const command = `npx sanity cors add "${domain}" --credentials`;
    execSync(command, { stdio: 'inherit' });
    
    console.log(`✅ ${domain} agregado exitosamente\n`);
  } catch (error) {
    console.log(`⚠️  Error agregando ${domain}:`, error.message);
    console.log('   (Puede que ya esté configurado)\n');
  }
});

console.log('📋 Verificando configuración actual...');
try {
  execSync('npx sanity cors list', { stdio: 'inherit' });
} catch (error) {
  console.log('⚠️  Error listando CORS:', error.message);
}

console.log('\n✅ Configuración de CORS completada!');
console.log('\n📝 Pasos adicionales:');
console.log('1. Verifica en https://www.sanity.io/manage');
console.log('2. Ve a tu proyecto → Settings → API → CORS Origins');
console.log('3. Confirma que los dominios estén listados');
console.log('4. Asegúrate de que "Allow credentials" esté marcado');