import { NextRequest, NextResponse } from "next/server";
import { writeClient } from "@/sanity/lib/client";
import { sendOrderConfirmation } from "@/lib/whatsapp";

const PRODUCT_OPTION_GROUPS_QUERY = `*[_type == "product" && _id in $ids]{
  _id,
  optionGroups
}`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

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
    const productIds = Array.from(
      new Set(
        items
          .map((item: any) => item.product?._id || item.product?.id)
          .filter(Boolean)
      )
    );
    const productsWithOptions = await writeClient.fetch<
      Array<{ _id: string; optionGroups?: ProductOptionGroup[] }>
    >(PRODUCT_OPTION_GROUPS_QUERY, { ids: productIds });
    const optionGroupsByProductId = new Map(
      productsWithOptions.map((product) => [product._id, product.optionGroups || []])
    );

    // Construir los productos como referencias (schema unificado `order`).
    // Se preserva el precio del momento como snapshot en las notas del ítem.
    const sanityProducts = items.map((item: any) => {
      const productId = item.product?._id || item.product?.id;
      const optionGroups =
        item.product?.optionGroups?.length > 0
          ? item.product.optionGroups
          : optionGroupsByProductId.get(productId);

      const transformedCustomizations = transformCustomizations(
        item.customizations,
        optionGroups
      );

      const unitPrice = item.customPrice ?? item.product?.price;
      const priceNote = `Precio original al ordenar: $${unitPrice ?? "?"}`;
      const existingNote = (item.notes || "").trim();

      return {
        _key: crypto.randomUUID(),
        product: { _type: "reference", _ref: productId },
        quantity: item.quantity,
        customizations: transformedCustomizations,
        notes: existingNote ? `${existingNote}\n${priceNote}` : priceNote,
      };
    });

    // El campo estimatedPickupDate es datetime; solo lo seteamos si es ISO válido.
    // De lo contrario (p.ej. "10-20 minutos") lo guardamos en deliveryNotes.
    const estimatedIsIso =
      typeof estimatedDelivery === "string" &&
      !Number.isNaN(Date.parse(estimatedDelivery));
    const deliveryNotesParts: string[] = [];
    if (!estimatedIsIso && estimatedDelivery)
      deliveryNotesParts.push(`Tiempo estimado de recogida: ${estimatedDelivery}`);
    if (notes) deliveryNotesParts.push(`Notas del cliente: ${notes}`);

    // Crear orden en Sanity (schema unificado `order` con orderType: "pickup")
    const normalizedCustomerPhone = typeof phone === "string" ? phone.trim() : "";

    const orderData: { _type: string; [key: string]: any } = {
      _type: "order",
      orderNumber,
      orderType: "pickup",
      currency: "mxn",
      customerName: customerName || "Cliente",
      email: customerEmail,
      clerkUserId,
      phone: normalizedCustomerPhone || undefined,
      pickupStore: storeId ? { _type: "reference", _ref: storeId } : undefined,
      affiliateStore: storeId ? { _type: "reference", _ref: storeId } : undefined,
      products: sanityProducts,
      totalPrice: total,
      subtotal: total,
      shippingCost: 0,
      paymentMethod,
      status: "pending_pickup",
      pickupStatus: "in_transit",
      pickupCode,
      orderDate: new Date().toISOString(),
    };

    if (estimatedIsIso) orderData.estimatedPickupDate = estimatedDelivery;
    if (deliveryNotesParts.length)
      orderData.deliveryNotes = deliveryNotesParts.join(" | ");

    let order;
    try {
      order = await writeClient.create(orderData);
    } catch (sanityError) {
      console.error("❌ Error guardando en Sanity:", sanityError);
      throw new Error(
        `Error guardando la orden en la base de datos: ${sanityError instanceof Error ? sanityError.message : "Error desconocido"}`
      );
    }

    if (normalizedCustomerPhone && orderNumber) {
      void sendOrderConfirmation(normalizedCustomerPhone, customerName || "Cliente", orderNumber).catch(
        (whatsappError) => {
          console.error(
            "[create-click-collect-order] WhatsApp error:",
            whatsappError
          );
        }
      );
    }

    // NOTA: Simulación automática deshabilitada para permitir ver el estado inicial
    // En producción, este proceso sería manejado por el administrador o un sistema de inventario
    
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

type ProductOptionGroup = {
  title?: string;
  description?: string;
  required?: boolean;
  selectionType?: "single" | "multiple";
  options?: Array<{
    label?: string;
    description?: string;
    priceDelta?: number;
    isDefault?: boolean;
  }>;
};

// Transformar customizaciones del formato del store al formato de Sanity
function transformCustomizations(
  customizations: { [key: string]: string | string[] } | undefined,
  optionGroups: ProductOptionGroup[] | undefined
): Array<{
  _key: string;
  title?: string;
  options?: Array<{
    _key: string;
    label?: string;
    priceDelta?: number;
  }>;
}> {
  if (!customizations || Object.keys(customizations).length === 0) {
    return [];
  }

  return Object.entries(customizations).map(([groupKey, selection]) => {
    // Extraer el índice del grupo (e.g., "group-0" -> 0)
    const groupIndex = parseInt(groupKey.replace("group-", ""), 10);
    const group = optionGroups?.[groupIndex];

    // Convertir la selección a array
    const selectedOptions = Array.isArray(selection) ? selection : [selection];

    // Buscar las opciones seleccionadas en el grupo (si hay optionGroups disponibles)
    const options = selectedOptions
      .filter((label) => !!label)
      .map((selectedLabel) => {
        const option = group?.options?.find((opt) => opt.label === selectedLabel);
        return {
          label: selectedLabel,
          priceDelta: option?.priceDelta || 0,
        };
      });

    return {
      _key: crypto.randomUUID(),
      // Usar el título del grupo si está disponible, sino usar el groupKey como fallback
      title: group?.title || groupKey,
      options: options.map((opt) => ({ _key: crypto.randomUUID(), ...opt })),
    };
  });
}
