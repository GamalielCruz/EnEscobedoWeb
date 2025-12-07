import { client } from "@/sanity/lib/client";
import imageUrlBuilder from "@sanity/image-url";
import { SanityImageSource } from "@sanity/image-url/lib/types/types";

const builder = imageUrlBuilder(client);

export function imageUrl(source: SanityImageSource) {
    if (!source) return builder.image('');
    
    return builder.image(source)
        .auto('format')
        .quality(85)
        .fit('max');
}

// Función específica para obtener URL directa (útil para debugging)
export function getImageUrl(source: SanityImageSource, width?: number) {
    if (!source) return '';
    
    let imageBuilder = builder.image(source)
        .auto('format')
        .quality(85)
        .fit('max');
    
    if (width) {
        imageBuilder = imageBuilder.width(width);
    }
    
    return imageBuilder.url();
}