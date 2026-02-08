import ProductGrid from "@/components/ProductGrid";
import { searchProductsByName } from "@/sanity/lib/products/searchProductsByName";
import Link from "next/link";

async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    query?: string;
  }>;
}) {
  const { query } = await searchParams;
  
  // Handle case when no query is provided
  if (!query || query.trim() === "") {
    return (
      <div className="flex flex-col items-center justify-center justify-top min-h-screen bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-4xl">
          <h1 className="text-3xl font-bold mb-6 text-center">
            Búsqueda de Productos
          </h1>
          <p className="text-gray-600 text-center">
            Ingresa un término de búsqueda para encontrar productos.
          </p>
        </div>
      </div>
    );
  }

  try {
    const products = await searchProductsByName(query.trim());

    if (!products.length) {
      return (
        <div className="flex flex-col items-center justify-center justify-top min-h-screen bg-gray-100 p-4">
          <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-4xl">
            <h1 className="text-3xl font-bold mb-6 text-center">
              No se encontraron productos para: &ldquo;{query}&rdquo;
            </h1>
            <p className="text-gray-600 text-center mb-4">
              Intenta con otra búsqueda o revisa la ortografía. Si necesitas ayuda, contacta a nuestro soporte.
            </p>
            <div className="text-center">
              <Link 
                href="/" 
                className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Volver al inicio
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-top min-h-screen bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-4xl">
          <h1 className="text-2xl font-bold mb-6 text-center">
            Resultados para: &ldquo;{query}&rdquo;
          </h1>
          <p className="text-gray-600 text-center mb-6">
            Se encontraron {products.length} producto{products.length !== 1 ? 's' : ''}
          </p>
          <ProductGrid products={products} />
        </div>
      </div>
    );
  } catch (error) {
    console.error("Error searching products:", error);
    return (
      <div className="flex flex-col items-center justify-center justify-top min-h-screen bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-4xl">
          <h1 className="text-3xl font-bold mb-6 text-center text-red-600">
            Error en la búsqueda
          </h1>
          <p className="text-gray-600 text-center">
            Ocurrió un error al buscar productos. Por favor, intenta de nuevo más tarde.
          </p>
          <div className="text-center mt-4">
            <Link 
              href="/" 
              className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    );
  }
}

export default SearchPage;
