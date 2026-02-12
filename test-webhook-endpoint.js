// Script para probar si el webhook endpoint está funcionando
const http = require('http');

const webhookData = {
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'test_session_' + Date.now(),
      payment_status: 'paid',
      metadata: {
        orderNumber: 'TEST-' + Date.now(),
        customerName: 'Test Customer',
        customerEmail: 'test@example.com',
        clerkUserId: 'user_test',
        deliveryMethod: 'delivery',
        pickupStoreId: 'a36a9d33-ee5f-4b17-bedf-40a715577c01',
        pickupStoreName: 'Tienda de Crepas',
        customerAddress: 'Test Address',
        shippingCost: 30
      },
      amount_total: 3200, // $32 MXN
      currency: 'mxn',
      customer: 'cus_test',
      customer_details: {
        phone: '+1234567890'
      },
      total_details: {
        amount_discount: 0
      }
    }
  }
};

const webhookSecret = 'whsec_' + 'a'.repeat(32); // Fake signature for testing

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/webhook',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'stripe-signature': webhookSecret
  }
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers: ${JSON.stringify(res.headers)}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:', data);
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(JSON.stringify(webhookData));
req.end();

console.log('🧪 Enviando test al webhook endpoint...');
