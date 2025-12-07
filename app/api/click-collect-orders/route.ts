import { NextRequest, NextResponse } from "next/server";
import { client, writeClient } from "@/sanity/lib/client";

// Query para obtener órdenes de click and collect
const ORDERS_QUERY = `*[_type == "clickCollectOrder"] | order(createdAt desc) {
  _id,
  orderNumber,
  pickupCode,
  customerInfo,
  storeInfo,
  items[] {
    _key,
    product-> {
      _id,
      name,
      slug,
      price,
      image
    },
    quantity,
    price
  },
  totalAmount,
  paymentMethod,
  status,
  estimatedPickupDate,
  readyAt,
  pickedUpAt,
  notes,
  createdAt,
  updatedAt
}`;

// Query para obtener una orden específica
const ORDER_BY_NUMBER_QUERY = `*[_type == "clickCollectOrder" && orderNumber == $orderNumber][0] {
  _id,
  orderNumber,
  pickupCode,
  customerInfo,
  storeInfo,
  items[] {
    _key,
    product-> {
      _id,
      name,
      slug,
      price,
      image
    },
    quantity,
    price
  },
  totalAmount,
  paymentMethod,
  status,
  estimatedPickupDate,
  readyAt,
  pickedUpAt,
  notes,
  createdAt,
  updatedAt
}`;

// GET - Obtener todas las órdenes o una específica
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderNumber = searchParams.get('orderNumber');
    const status = searchParams.get('status');
    const limit = searchParams.get('limit');

    console.log('📋 Consultando órdenes de click and collect:', {
      orderNumber,
      status,
      limit
    });

    let query = ORDERS_QUERY;
    let params: any = {};

    // Si se especifica un número de orden
    if (orderNumber) {
      query = ORDER_BY_NUMBER_QUERY;
      params.orderNumber = orderNumber;
    }
    // Si se especifica un estado
    else if (status) {
      query = `*[_type == "clickCollectOrder" && status == $status] | order(createdAt desc) {
        _id,
        orderNumber,
        pickupCode,
        customerInfo,
        storeInfo,
        items[] {
          _key,
          product-> {
            _id,
            name,
            slug,
            price,
            image
          },
          quantity,
          price
        },
        totalAmount,
        paymentMethod,
        status,
        estimatedPickupDate,
        readyAt,
        pickedUpAt,
        notes,
        createdAt,
        updatedAt
      }`;
      params.status = status;
    }

    // Agregar límite si se especifica
    if (limit && !orderNumber) {
      query += `[0...${parseInt(limit)}]`;
    }

    const orders = await client.fetch(query, params);

    console.log(`✅ Encontradas ${Array.isArray(orders) ? orders.length : (orders ? 1 : 0)} órdenes`);

    return NextResponse.json({
      success: true,
      data: {
        orders: orderNumber ? (orders ? [orders] : []) : orders,
        count: Array.isArray(orders) ? orders.length : (orders ? 1 : 0)
      }
    });

  } catch (error) {
    console.error('❌ Error consultando órdenes:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Error consultando órdenes',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}

// PATCH - Actualizar estado de una orden
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderNumber, status, notes } = body;

    if (!orderNumber || !status) {
      return NextResponse.json(
        { success: false, error: 'orderNumber y status son requeridos' },
        { status: 400 }
      );
    }

    console.log('🔄 Actualizando orden:', { orderNumber, status });

    // Buscar la orden
    const order = await client.fetch(ORDER_BY_NUMBER_QUERY, { orderNumber });

    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Orden no encontrada' },
        { status: 404 }
      );
    }

    // Preparar datos de actualización
    const updateData: any = {
      status,
      updatedAt: new Date().toISOString()
    };

    // Agregar timestamps específicos según el estado
    if (status === 'ready_for_pickup' && !order.readyAt) {
      updateData.readyAt = new Date().toISOString();
    } else if (status === 'completed' && !order.pickedUpAt) {
      updateData.pickedUpAt = new Date().toISOString();
    }

    // Agregar notas si se proporcionan
    if (notes) {
      updateData.notes = notes;
    }

    // Actualizar en Sanity
    const updatedOrder = await writeClient
      .patch(order._id)
      .set(updateData)
      .commit();

    console.log('✅ Orden actualizada exitosamente:', {
      orderId: updatedOrder._id,
      orderNumber,
      newStatus: status
    });

    return NextResponse.json({
      success: true,
      data: {
        orderId: updatedOrder._id,
        orderNumber,
        status,
        updatedAt: updateData.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Error actualizando orden:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Error actualizando orden',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}