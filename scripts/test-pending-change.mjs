import 'dotenv/config';
import { createClient } from 'next-sanity';

async function run() {
  const client = createClient({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
    apiVersion: '2024-07-25',
    useCdn: false,
    token: process.env.SANITY_API_TOKEN,
  });

  try {
    console.log('Sanity client ready. Creating test product...');
    const doc = {
      _type: 'product',
      name: 'TEST PRODUCT FOR PENDING CHANGES ' + Date.now(),
      price: 10,
      slug: { _type: 'slug', current: 'test-product-' + Date.now() },
      ...(process.env.TEST_STORE_ID ? { affiliateStore: { _type: 'reference', _ref: process.env.TEST_STORE_ID } } : {}),
      approvalStatus: 'approved',
      isVisible: true,
    };

    const created = await client.create(doc);
    console.log('Created product:', created._id);

    console.log('Patching product with pendingChanges...');
    const pending = {
      name: 'NEW NAME PENDING',
      price: 99.5,
      stock: 5,
      description: [
        {
          _type: 'block',
          _key: 'desc-test',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'Pending description' }],
          markDefs: [],
        },
      ],
    };

    const patched = await client.patch(created._id).set({
      pendingChanges: pending,
      approvalStatus: 'pending',
      submittedBy: 'script-test',
      submittedAt: new Date().toISOString(),
    }).commit();

    console.log('Patched result:', { _id: patched._id, approvalStatus: patched.approvalStatus, pendingChanges: !!patched.pendingChanges });

    const fetched = await client.fetch("*[_type == 'product' && _id == $id]{_id, approvalStatus, pendingChanges}[0]", { id: created._id });
    console.log('Fetched doc:', JSON.stringify(fetched, null, 2));

  } catch (err) {
    console.error('Error in test script:', err);
    process.exit(1);
  }
}

run();
