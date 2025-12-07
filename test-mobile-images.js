// Script para probar carga de imágenes de Sanity en móviles
const https = require('https');
const { URL } = require('url');

// URLs de prueba de Sanity
const testImageUrls = [
  'https://cdn.sanity.io/images/kgklfrat/production/test.jpg',
  'https://cdn.sanity.io/images/kgklfrat/production/test.jpg?w=400&h=400&fit=crop&auto=format',
  'https://kgklfrat.api.sanity.io/v2024-07-25/data/query/production?query=*[_type=="product"][0].image',
];

async function testImageUrl(url, userAgent = 'desktop') {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      timeout: 15000,
      headers: {
        'User-Agent': userAgent === 'mobile' 
          ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1'
          : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
      }
    };

    const req = https.request(options, (res) => {
      let responseSize = 0;
      res.on('data', (chunk) => {
        responseSize += chunk.length;
      });
      
      res.on('end', () => {
        const success = res.statusCode >= 200 && res.statusCode < 300;
        console.log(`${success ? '✅' : '❌'} [${userAgent}] ${url}`);
        console.log(`   Status: ${res.statusCode} | Size: ${responseSize} bytes | Content-Type: ${res.headers['content-type']}`);
        resolve({ url, success, status: res.statusCode, size: responseSize, userAgent });
      });
    });

    req.on('error', (err) => {
      console.log(`❌ [${userAgent}] ${url}: ${err.message}`);
      resolve({ url, success: false, error: err.message, userAgent });
    });

    req.on('timeout', () => {
      console.log(`⏰ [${userAgent}] ${url}: Timeout`);
      req.destroy();
      resolve({ url, success: false, error: 'Timeout', userAgent });
    });

    req.end();
  });
}

async function runImageTests() {
  console.log('🖼️  Probando carga de imágenes de Sanity...\n');
  
  const results = [];
  
  // Probar con user agent de escritorio
  console.log('📱 Probando con User-Agent de ESCRITORIO:');
  for (const url of testImageUrls) {
    const result = await testImageUrl(url, 'desktop');
    results.push(result);
  }
  
  console.log('\n📱 Probando con User-Agent de MÓVIL:');
  for (const url of testImageUrls) {
    const result = await testImageUrl(url, 'mobile');
    results.push(result);
  }
  
  console.log('\n📊 Resumen de resultados:');
  const desktopResults = results.filter(r => r.userAgent === 'desktop');
  const mobileResults = results.filter(r => r.userAgent === 'mobile');
  
  console.log(`\n🖥️  Escritorio: ${desktopResults.filter(r => r.success).length}/${desktopResults.length} exitosas`);
  console.log(`📱 Móvil: ${mobileResults.filter(r => r.success).length}/${mobileResults.length} exitosas`);
  
  const mobileFailures = mobileResults.filter(r => !r.success);
  if (mobileFailures.length > 0) {
    console.log('\n⚠️  Fallos en móvil:');
    mobileFailures.forEach(failure => {
      console.log(`   ${failure.url}: ${failure.error || failure.status}`);
    });
  }
  
  return {
    desktop: desktopResults,
    mobile: mobileResults,
    mobileIssues: mobileFailures.length > 0
  };
}

// Función adicional para probar conectividad general
async function testGeneralConnectivity() {
  console.log('\n🌐 Probando conectividad general...');
  
  const generalUrls = [
    'https://www.google.com',
    'https://cdn.jsdelivr.net/npm/react@18.0.0/package.json',
    'https://api.github.com'
  ];
  
  for (const url of generalUrls) {
    await testImageUrl(url, 'mobile');
  }
}

runImageTests()
  .then(async (results) => {
    if (results.mobileIssues) {
      console.log('\n🔍 Detectados problemas en móvil, probando conectividad general...');
      await testGeneralConnectivity();
    } else {
      console.log('\n✅ Todas las pruebas de imágenes pasaron correctamente!');
    }
  })
  .catch(console.error);