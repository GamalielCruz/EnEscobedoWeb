"use client";

import { PRODUCT_SEARCH_QUERY_RESULT, Product } from "@/sanity.types";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import ProductThumb from "./ProductThumb";

type ProductGridProduct = Product | PRODUCT_SEARCH_QUERY_RESULT[number];

function ProductGrid({ products }: { products: ProductGridProduct[] }) {
    const reduceMotion = useReducedMotion();
    // Sort products by creation date (newest first)
    const sortedProducts = [...(products || [])].sort((a, b) => {
        const dateA = a._createdAt ? new Date(a._createdAt).getTime() : 0;
        const dateB = b._createdAt ? new Date(b._createdAt).getTime() : 0;
        return dateB - dateA;
    });

    return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4 w-full">
        <AnimatePresence initial={false}>
            {sortedProducts.map((product) => (
                <motion.div
                key={product._id}
                layout={!reduceMotion}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.18 }}
                className="w-full"
                >
                    <ProductThumb product={product} />
                </motion.div>
            ))}
        </AnimatePresence>
    </div>
    );
}

export default ProductGrid;
