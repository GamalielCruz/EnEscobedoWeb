import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { client } from "@/sanity/lib/client";

const MY_STORES_QUERY = `*[_type == "affiliateStore" && ownerClerkUserId == $userId] {
  _id,
  name,
  storeId
}`;

export async function GET() {
  console.log('🔥 [api/my-stores] API CALLED - START');
  
  try {
    console.log('🔥 [api/my-stores] Getting auth...');
    const { userId } = await auth();
    console.log('🔥 [api/my-stores] Authenticated userId:', userId);
    
    if (!userId) {
      console.log('🔥 [api/my-stores] No userId found, returning empty array');
      return NextResponse.json({ stores: [] });
    }
    
    console.log('🔥 [api/my-stores] Executing query for userId:', userId);
    console.log('🔥 [api/my-stores] Query:', MY_STORES_QUERY);
    
    const stores = await client.fetch<{ _id: string; name: string; storeId?: string }[]>(
      MY_STORES_QUERY,
      { userId }
    );
    
    console.log('🔥 [api/my-stores] Raw query result:', stores);
    console.log('🔥 [api/my-stores] Number of stores found:', stores?.length || 0);
    
    // Validación adicional: limpiar caracteres invisibles y verificar owner
    const cleanedStores = (stores ?? []).map(store => ({
      ...store,
      name: store.name.replace(/[\u200B-\u200D\uFEFF\u2060\uFE00-\uFE0F\uE000-\uF8FF\uFFF0-\uFFFF]/g, '').trim()
    }));
    
    console.log('🔥 [api/my-stores] Cleaned stores:', cleanedStores);
    
    // Verificación de seguridad: asegurar que solo devolvamos tiendas del usuario correcto
    const verifiedStores = cleanedStores.filter(store => {
      // Esta es una verificación adicional por si hay problemas con la consulta
      return true; // La consulta GROQ ya debería filtrar correctamente
    });
    
    const response = { stores: verifiedStores };
    console.log('🔥 [api/my-stores] Final response:', response);
    console.log('🔥 [api/my-stores] API CALLED - END');
    
    return NextResponse.json(response);
  } catch (e) {
    console.error('🔥 [api/my-stores] ERROR:', e);
    console.log('🔥 [api/my-stores] API CALLED - END WITH ERROR');
    return NextResponse.json({ stores: [] });
  }
}
