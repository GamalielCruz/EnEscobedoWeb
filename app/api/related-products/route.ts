import { NextRequest, NextResponse } from 'next/server';
import { getAllProducts } from '@/sanity/lib/products/getAllProducts';

export async function POST(request: NextRequest) {
  try {
    const { productSlug, productCategories } = await request.json();

    if (!productSlug || !Array.isArray(productCategories)) {
      return NextResponse.json(
        { error: 'Invalid request parameters' },
        { status: 400 }
      );
    }

    // Fetch all products
    const allProducts = await getAllProducts();
    
    // Filter related products
    let relatedProducts = allProducts.filter((p) => {
      // Check if products share any categories
      const pCategories = p.categories?.map(cat => cat._ref) || [];
      const hasCommonCategory = productCategories.some(cat => pCategories.includes(cat));
      return hasCommonCategory && p.slug?.current !== productSlug;
    });

    // Randomize and limit to 4 products
    relatedProducts = relatedProducts
      .sort(() => Math.random() - 0.5)
      .slice(0, 4);

    return NextResponse.json({ relatedProducts });
  } catch (error) {
    console.error('Error fetching related products:', error);
    return NextResponse.json(
      { error: 'Failed to fetch related products' },
      { status: 500 }
    );
  }
}