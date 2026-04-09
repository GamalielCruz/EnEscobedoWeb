import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { client } from "@/sanity/lib/client";

const MY_STORES_QUERY = `*[_type == "affiliateStore" && ownerClerkUserId == $userId] {
  _id,
  name,
  storeId,
  ownerClerkUserId
}`;

export async function GET() {
  console.log('🔥 [api/my-stores] API CALLED - START');
  
  try {
    console.log('🔥 [api/my-stores] Getting auth...');
    const { userId } = await auth();
    console.log('🔥 [api/my-stores] Authenticated userId:', userId);
    
    if (!userId) {
      console.log('🔥 [api/my-stores] No userId found, returning empty array');
      return NextResponse.json({ 
        stores: [],
        debug: { 
          message: "No authenticated user found",
          userId: userId 
        }
      });
    }
    
    console.log('🔥 [api/my-stores] Executing query for userId:', userId);
    console.log('🔥 [api/my-stores] Query:', MY_STORES_QUERY);
    
    const stores = await client.fetch<{ _id: string; name: string; storeId?: string; ownerClerkUserId?: string }[]>(
      MY_STORES_QUERY,
      { userId },
      { 
        // Forzar refresh para evitar caché
        perspective: 'published',
        useCdn: false,
        cache: 'no-store'
      }
    );
    
    console.log('🔥 [api/my-stores] Raw query result:', stores);
    console.log('🔥 [api/my-stores] Number of stores found:', stores?.length || 0);
    
    // Validación adicional: limpiar caracteres invisibles y verificar owner
    const cleanedStores = (stores ?? []).map(store => ({
      ...store,
      name: store.name
        .replace(/[\u200B-\u200D\uFEFF\u2060\uFE00-\uFE0F\uE000-\uF8FF\uFFF0-\uFFFF]/g, '') // Caracteres invisibles
        .replace(/\uFEFF/g, '') // BOM específico
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Caracteres de control
        .trim()
    }));
    
    console.log('🔥 [api/my-stores] Cleaned stores:', cleanedStores);
    
    // Verificación de seguridad: asegurar que solo devolvamos tiendas del usuario correcto
    const verifiedStores = cleanedStores.filter(store => {
      // Verificación explícita del ownerClerkUserId
      console.log('🔍 Verifying store:', store.name, 'owner:', store.ownerClerkUserId, 'expected:', userId);
      return store.ownerClerkUserId === userId;
    });
    
    const response = { 
      stores: verifiedStores,
      debug: {
        userId: userId,
        queryResult: stores,
        cleanedStores: cleanedStores,
        verifiedCount: verifiedStores.length
      }
    };
    console.log('🔥 [api/my-stores] Final response:', response);
    console.log('🔥 [api/my-stores] API CALLED - END');
    
    return NextResponse.json(response);
  } catch (e) {
    console.error('🔥 [api/my-stores] ERROR:', e);
    console.log('🔥 [api/my-stores] API CALLED - END WITH ERROR');
    return NextResponse.json({ stores: [] });
  }
}
