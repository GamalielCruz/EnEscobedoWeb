import { NextRequest, NextResponse } from "next/server";
import { writeClient } from "@/sanity/lib/client";
import type { ClickCollectOrder } from "@/sanity.types";

export async function POST(request: NextRequest) {
  console.log("🚀 Iniciando creación de orden Click & Collect...");

  try {
    const body = await request.json();
    console.log("📦 Datos recibidos:", JSON.stringify(body, null, 2));

    const {
      orderNumber,
      customerName,
      customerEmail,
      clerkUserId,
      phone,
      notes,
      storeId,
      storeName,
      storeAddress,
      storePhone,
      estimatedDelivery,
      items,
      total,
      paymentMethod = "cash_on_pickup",
    } = body;

    // Validar datos requeridos
    if (
      !orderNumber ||
      !customerEmail ||
      !clerkUserId ||
      !phone ||
      !storeId ||
      !items ||
      items.length === 0
    ) {
      return NextResponse.json(
        { success: false, error: "Faltan datos requeridos" },
        { status: 400 }
      );
    }

    // Generar código de recogida único
    const pickupCode = generatePickupCode();

    // Crear orden en Sanity
    const orderData = {
      _type: "clickCollectOrder",
      orderNumber,
      pickupCode,
      customerInfo: {
        name: customerName,
        email: customerEmail,
        clerkUserId,
        phone,
      },
      storeInfo: {
        storeId,
        storeName,
        storeAddress,
        storePhone,
      },
      items: items.map((item: any) => {
        console.log("📦 Procesando item:", JSON.stringify(item, null, 2));
        return {
          _key: crypto.randomUUID(),
          productName: item.product.name,
          productId: item.product._id || item.product.id,
          quantity: item.quantity,
          price: item.product.price,
          customizations: item.customizations || [],
          notes: item.notes || "",
        };
      }),
      totalAmount: total,
      paymentMethod,
      status: "pending",
      estimatedPickupDate: estimatedDelivery,
      notes: notes || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    console.log("💾 Guardando orden en Sanity:", {
      orderNumber,
      pickupCode,
      storeId,
      total,
      itemCount: items.length,
    });

    // Guardar en Sanity
    console.log(
      "💾 Intentando guardar en Sanity:",
      JSON.stringify(orderData, null, 2)
    );

    let order;
    try {
      order = await writeClient.create(orderData);
      console.log("✅ Orden Click & Collect creada en Sanity:", {
        orderId: order._id,
        orderNumber,
        pickupCode,
        storeId,
        total,
        itemCount: items.length,
      });
    } catch (sanityError) {
      console.error("❌ Error guardando en Sanity:", sanityError);
      console.error(
        "❌ Datos que causaron el error:",
        JSON.stringify(orderData, null, 2)
      );
      throw new Error(
        `Error guardando la orden en la base de datos: ${sanityError instanceof Error ? sanityError.message : "Error desconocido"}`
      );
    }

    // NOTA: Simulación automática deshabilitada para permitir ver el estado inicial
    // En producción, este proceso sería manejado por el administrador o un sistema de inventario
    
    console.log("📝 Orden creada con estado inicial 'pending' - Los administradores pueden actualizar el estado manualmente");
    
    // Opcional: Descomentar para habilitar la simulación automática después de 10 segundos
    /*
    setTimeout(async () => {
      try {
        console.log("🔄 Simulando tránsito de pedido...");
        console.log("📦 Pedido llegó a la tienda - Estado: listo para recoger");

        // Actualizar estado en Sanity
        await writeClient
          .patch(order._id)
          .set({
            status: "ready_for_pickup",
            readyAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .commit();

        console.log("✅ Estado actualizado en Sanity: ready_for_pickup");

        // Enviar notificación
        const notifyResponse = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/notify-pickup-ready`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              orderNumber,
              pickupCode,
              customerName,
              customerEmail,
              phone,
              storeName,
              storeAddress,
              storePhone,
              total,
            }),
          }
        );

        if (notifyResponse.ok) {
          console.log("📧 Notificación de recogida enviada exitosamente");
        } else {
          console.error(
            "❌ Error enviando notificación:",
            await notifyResponse.text()
          );
        }
      } catch (error) {
        console.error("❌ Error en simulación de tránsito:", error);
      }
    }, 10000); // 10 segundos para demo (en producción serían 2-3 días)
    */

    return NextResponse.json({
      success: true,
      data: {
        orderId: order._id,
        orderNumber,
        pickupCode,
        estimatedPickupDate: estimatedDelivery,
        storeInfo: {
          name: storeName,
          address: storeAddress,
          phone: storePhone,
        },
        total,
      },
    });
  } catch (error) {
    console.error("❌ Error creando orden Click & Collect:", error);
    console.error(
      "❌ Stack trace:",
      error instanceof Error ? error.stack : "No stack trace"
    );
    return NextResponse.json(
      {
        success: false,
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}

// Generar código de recogida único (6 caracteres alfanuméricos)
function generatePickupCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
