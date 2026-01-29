// Script para probar la limpieza de texto y caracteres Unicode problemáticos
console.log('🧹 PRUEBA DE LIMPIEZA DE TEXTO');
console.log('==============================');

// Función de limpieza (igual que en el servidor)
function cleanText(text) {
  if (!text) return "";
  // Remove invisible characters, zero-width spaces, and other problematic Unicode
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width spaces
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Control characters
    .replace(/[\u2000-\u206F]/g, ' ') // General punctuation block
    .replace(/[\uFFF0-\uFFFF]/g, '') // Specials block
    .trim();
}

// Función para mostrar caracteres problemáticos
function analyzeText(text, label) {
  console.log(`\n📝 ANALIZANDO: ${label}`);
  console.log(`   Texto original: "${text}"`);
  console.log(`   Longitud: ${text.length} caracteres`);
  
  // Mostrar códigos de caracteres problemáticos
  const problematicChars = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = char.charCodeAt(0);
    
    // Detectar caracteres problemáticos
    if (
      (code >= 0x200B && code <= 0x200D) || // Zero-width spaces
      code === 0xFEFF || // BOM
      (code >= 0x0000 && code <= 0x001F) || // Control characters
      (code >= 0x007F && code <= 0x009F) || // More control characters
      (code >= 0x2000 && code <= 0x206F) || // General punctuation
      (code >= 0xFFF0 && code <= 0xFFFF)    // Specials
    ) {
      problematicChars.push({
        char: char,
        code: code,
        hex: code.toString(16),
        position: i
      });
    }
  }
  
  if (problematicChars.length > 0) {
    console.log(`   ⚠️  Caracteres problemáticos encontrados: ${problematicChars.length}`);
    problematicChars.forEach(item => {
      console.log(`      Posición ${item.position}: U+${item.hex.toUpperCase()} (${item.code})`);
    });
  } else {
    console.log(`   ✅ No se encontraron caracteres problemáticos`);
  }
  
  const cleaned = cleanText(text);
  console.log(`   Texto limpio: "${cleaned}"`);
  console.log(`   Longitud limpia: ${cleaned.length} caracteres`);
  
  return cleaned;
}

// Función para probar casos comunes
function testCommonCases() {
  console.log('\n🧪 PROBANDO CASOS COMUNES:');
  console.log('==========================');
  
  const testCases = [
    {
      label: "Texto normal",
      text: "Ejemplo 31, Pedro Escobedo, Querétaro"
    },
    {
      label: "Con zero-width spaces",
      text: "Ejemplo\u200B 31\u200C, Pedro\u200D Escobedo"
    },
    {
      label: "Con caracteres de control",
      text: "Ejemplo\u0001 31\u001F, Pedro Escobedo"
    },
    {
      label: "Con BOM",
      text: "\uFEFFEjemplo 31, Pedro Escobedo"
    },
    {
      label: "Con espacios Unicode",
      text: "Ejemplo\u2000 31\u2003, Pedro\u2009Escobedo"
    },
    {
      label: "Texto problemático simulado",
      text: "Ejemplo​​​​‌‍​‍​‍‌‍‌​‍‌‍‍‌‌‍‌‌‍‍‌‌‍‍​‍​‍​‍‍​‍​‍‌​‌‍​‌‌‍‍‌‍‍‌‌‌​‌‍‌​‍‍‌‍‍‌‌‍​‍​‍​‍​​‍​‍‌‍‍​‌​‍‌‍‌‌‌‍‌‍​‍​‍​‍‍​‍​‍‌‍‍​‌‌​‌‌​‌​​​‍‍​‍​‍‌‍​‌‍‌‍​‌‍​‌‌‍​‌‍‍​‌‍‌​‌‌​​‍‍​​​​​​​​​​​​‍‌​‌‌​‌‌‌‌‍‌​‌‍‍‌‌‍​‍‌‍‍‌‌‍‍‌‌​‌‍‌‌‌‍‍‌‌​​‍‌‍‌‌‌‍‌​‌‍‍‌‌‌​​‍‌‍‌‌‍‌‍‌​‌‍‌‌​‌‌​​‌​‍‌‍‌‌‌​‌‍‌‌‌‍‍‌‌​‌‍​‌‌‌​‌‍‍‌‌‍‌‍‍​‍‌‍‍‌‌‍‌​​‌‌‍​‌​​​‌‍‌‍​‌​‍‌‌‍‌​​​​​​‍‌‌‍‌‌‌‍‌‌​‌‌‌‍‌‍​‍‌​‌​‌‍​‍​​‌​‌​‍‌‌‍​‍‌‍‌‌‌‍‌​‌‍‌‍​‍‌​‌​​​​‌‍​‌​‌​​‌​‌‌​‌‌​‌​‌‌‍​​​​​​‌​‍‌‌​‌‍‌‌​​‌‍‌‌​‌‌‍​‌‌‍‌‍‌‍‌‍‌‍‍‌‌‍​‌‍‍‌‌‍​‌‌‌​‌‍‌‌‌‌​‌‌​‌‍‌​‍‌‍‌‌​‍‌​​‌‍​‌‌‌​‌‍‍​​‌‌‍​‌‌‍‌​‌‍‌​‌​‍‌‍‌‌‌​‌​​‍‍‌​‌‌​‌​‍‌‍‌‌‌‍‌‌‌‌​​‌‍​‍‌‍​‌‌​‌‍‌‌‌‌‌‌‌​‍‌‍​​‌‌‍‍​‌‌​‌‌​‌​​​‍‌‌​​‌​​‌​‍‌‌​​‍‌​‌‍​‍‌‌​​‍‌​‌‍‌‍​‌‍‌‍​‌‍​‌‌‍​‌‍‍​‌‍‌​‌‌​​‍‌‌​​‌​​‌​​​​​​​​​​​​‍‌‌​​‍‌​‌‍‌​‌‌​‌‌‌‌‍‌​‌‍‍‌‌‍​‍‌‍‌‍‍‌‌‍‌​​‌‌‍​‌​​​‌‍‌‍​‌​‍‌‌‍‌​​​​​​‍‌‌‍‌‌‌‍‌‌​‌‌‌‍‌‍​‍‌​‌​‌‍​‍​​‌​‌​‍‌‌‍​‍‌‍‌‌‌‍‌​‌‍‌‍​‍‌​‌​​​​‌‍​‌​‌​​‌​‌‌​‌‌​‌​‌‌‍​​​​​​‌​‍‌‍‌‌​‌‍‌‌​​‌‍‌‌​‌‌‍​‌‌‍‌‍‌‍‌‍‌‍‍‌‌‍​‌‍‍‌‌‍​‌‌‌​‌‍‌‌‌‌​‌‌​‌‍‌​‍‌‍‌‌​‍‌‍‌​​‌‍​‌‌‌​‌‍‍​​‌‌‍​‌‌‍‌​‌‍‌​‌​‍‌‍‌‌‌​‌​​‍‍‌​‌‌​‌​‍‌‍‌‌‌‍‌‌‌‌​​‍‌‍‌​​‌‍‌‌‌​‍‌​‌​​‌‍‌‌‌‍​‌‌​‌‍‍‌‌‌‍‌‍‌‌​‌‌​​‌‌‌‌‍​‍‌‍​‌‍‍‌‌​‌‍‍​‌‍‌‌‌‍‌​​‍​‍‌‌ 31"
    }
  ];
  
  testCases.forEach(testCase => {
    analyzeText(testCase.text, testCase.label);
  });
}

// Función para verificar localStorage
function checkLocalStorageForProblematicText() {
  console.log('\n💾 VERIFICANDO LOCALSTORAGE:');
  console.log('=============================');
  
  const savedStore = localStorage.getItem('clickCollectStore');
  
  if (savedStore) {
    try {
      const storeData = JSON.parse(savedStore);
      
      if (storeData.customerAddress) {
        console.log('\n📍 ANALIZANDO DIRECCIÓN EN LOCALSTORAGE:');
        
        const addr = storeData.customerAddress;
        if (addr.formatted_address) {
          analyzeText(addr.formatted_address, "formatted_address");
        }
        if (addr.address) {
          analyzeText(addr.address, "address");
        }
        if (addr.street) {
          analyzeText(addr.street, "street");
        }
        if (addr.city) {
          analyzeText(addr.city, "city");
        }
        if (addr.state) {
          analyzeText(addr.state, "state");
        }
      } else {
        console.log('❌ No hay customerAddress en localStorage');
      }
    } catch (e) {
      console.log('❌ Error parseando localStorage:', e.message);
    }
  } else {
    console.log('ℹ️  No hay datos en localStorage');
  }
}

// Función para mostrar soluciones
function showSolutions() {
  console.log('\n💡 SOLUCIONES IMPLEMENTADAS:');
  console.log('=============================');
  
  console.log('\n✅ LIMPIEZA AUTOMÁTICA DE TEXTO:');
  console.log('   - Se eliminan caracteres zero-width spaces');
  console.log('   - Se eliminan caracteres de control');
  console.log('   - Se eliminan caracteres Unicode problemáticos');
  console.log('   - Se normalizan espacios especiales');
  
  console.log('\n🔧 APLICADO EN:');
  console.log('   - Dirección de envío (line1, city, state, etc.)');
  console.log('   - Instrucciones COD');
  console.log('   - Notas de entrega');
  console.log('   - Información de tienda');
  
  console.log('\n🎯 RESULTADO ESPERADO:');
  console.log('   - Texto limpio sin caracteres extraños');
  console.log('   - Direcciones legibles en Sanity');
  console.log('   - Instrucciones claras para repartidores');
}

// Función principal
function runTextCleaningTest() {
  testCommonCases();
  checkLocalStorageForProblematicText();
  showSolutions();
  
  console.log('\n🎉 PRUEBA COMPLETADA');
  console.log('====================');
  console.log('La función cleanText() está lista para limpiar texto problemático.');
  console.log('Las próximas órdenes COD tendrán texto limpio y legible.');
}

// Exponer funciones para uso manual
window.cleanText = cleanText;
window.analyzeText = analyzeText;
window.checkLocalStorageForProblematicText = checkLocalStorageForProblematicText;

// Ejecutar prueba automáticamente
runTextCleaningTest();