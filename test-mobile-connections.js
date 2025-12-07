// Script para probar conexiones en móviles
const https = require('https');
const { URL } = require('url');

// URLs a probar
const testUrls = [
  'https://kgklfrat.api.sanity.io/v2024-07-25/data/live/events/production',
  'https://api.clerk.com/v1/client',
  'https://cdn.sanity.io'
];

async function testConnection(url) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1'
      }
    };

    const req = https.request(options, (res) => {
      console.log(`✅ ${url}: ${res.statusCode} ${res.statusMessage}`);
      resolve({ url, success: true, status: res.statusCode });
    });

    req.on('error', (err) => {
      console.log(`❌ ${url}: ${err.message}`);
      resolve({ url, success: false, error: err.message });
    });

    req.on('timeout', () => {
      console.log(`⏰ ${url}: Timeout`);
      req.destroy();
      resolve({ url, success: false, error: 'Timeout' });
    });

    req.end();
  });
}

async function runTests() {
  console.log('🧪 Probando conexiones móviles...\n');
  
  const results = [];
  for (const url of testUrls) {
    const result = await testConnection(url);
    results.push(result);
  }
  
  console.log('\n📊 Resumen:');
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.url}`);
    if (!result.success) {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  const successCount = results.filter(r => r.success).length;
  console.log(`\n${successCount}/${results.length} conexiones exitosas`);
}

runTests().catch(console.error);