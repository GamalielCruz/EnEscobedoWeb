// Script para probar URLs de Sanity reales
const https = require('https');
const { URL } = require('url');

// Función para obtener productos reales de Sanity
async function getSanityProducts() {
  return new Promise((resolve, reject) => {
    const query = encodeURIComponent('*[_type=="product" && defined(image)][0...3]{name, image}');
    const url = `https://kgklfrat.api.sanity.io/v2024-07-25/data/query/production?query=${query}`;
    
    const options = {
      hostname: 'kgklfrat.api.sanity.io',
      port: 443,
      path: `/v2024-07-25/data/query/production?query=${query}`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.result || []);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Función para generar URL de imagen de Sanity
function generateSanityImageUrl(imageRef, width = 400) {
  if (!imageRef || !imageRef.asset || !imageRef.asset._ref) {
    return null;
  }
  
  const ref = imageRef.asset._ref;
  // Formato: image-{id}-{width}x{height}-{format}
  const parts = ref.split('-');
  if (parts.length < 4) return null;
  
  const id = parts[1];
  const dimensions = parts[2];
  const format = parts[3];
  
  return `https://cdn.sanity.io/images/kgklfrat/production/${id}-${dimensions}.${format}?w=${width}&auto=format&q=85&fit=max`;
}

// Función para probar carga de imagen
async function testImageLoad(url, userAgent = 'mobile') {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      timeout: 10000,
      headers: {
        'User-Agent': userAgent === 'mobile' 
          ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1'
          : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      }
    };

    const req = https.request(options, (res) => {
      let size = 0;
      res.on('data', (chunk) => size += chunk.length);
      
      res.on('end', () => {
        const success = res.statusCode >= 200 && res.statusCode < 300;
        console.log(`${success ? '✅' : '❌'} [${userAgent}] ${res.statusCode} | ${size} bytes`);
        console.log(`   ${url}`);
        resolve({ success, status: res.statusCode, size });
      });
    });

    req.on('error', (err) => {
      console.log(`❌ [${userAgent}] Error: ${err.message}`);
      console.log(`   ${url}`);
      resolve({ success: false, error: err.message });
    });

    req.on('timeout', () => {
      console.log(`⏰ [${userAgent}] Timeout`);
      console.log(`   ${url}`);
      req.destroy();
      resolve({ success: false, error: 'Timeout' });
    });

    req.end();
  });
}

async function runTests() {
  console.log('🔍 Obteniendo productos reales de Sanity...\n');
  
  try {
    const products = await getSanityProducts();
    console.log(`📦 Encontrados ${products.length} productos con imágenes\n`);
    
    if (products.length === 0) {
      console.log('❌ No se encontraron productos con imágenes');
      return;
    }
    
    console.log('🖼️  Probando carga de imágenes reales...\n');
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      console.log(`--- Producto ${i + 1}: ${product.name} ---`);
      
      const imageUrl = generateSanityImageUrl(product.image, 400);
      if (!imageUrl) {
        console.log('❌ No se pudo generar URL de imagen');
        continue;
      }
      
      // Probar en móvil
      await testImageLoad(imageUrl, 'mobile');
      
      // Probar en escritorio
      await testImageLoad(imageUrl, 'desktop');
      
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error obteniendo productos:', error.message);
  }
}

runTests().catch(console.error);