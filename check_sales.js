const { createClient } = require('next-sanity');

const client = createClient({
  projectId: "t93gr28n",
  dataset: "production",
  useCdn: false,
  apiVersion: '2023-01-01',
});

async function checkSale() {
  try {
    const query = `*[_type == "sale"] { title, couponCode, isActive, discountAmount }`;
    const sales = await client.fetch(query);
    console.log('--- ALL SALES ---');
    console.log(JSON.stringify(sales, null, 2));
  } catch (e) {
    console.error('Error fetching sales:', e);
  }
}

checkSale();
