import { NextRequest, NextResponse } from 'next/server';
import { client } from '@/sanity/lib/client';

interface NotificationRequest {
  orderId: string;
  pickupCode: string;
  customerEmail: string;
  customerName: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: NotificationRequest = await request.json();
    
    // Validaciones
    if (!body.orderId || !body.customerEmail) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos' },
        { status: 400 }
      );
    }

    // Actualizar el estado de la orden en Sanity
    await client
      .patch(body.orderId)
      .set({ 
        pickupStatus: 'ready_for_pickup',
        readyForPickupAt: new Date().toISOString()
      })
      .commit();

    // Simular envío de email (en producción usarías un servicio como SendGrid, Resend, etc.)
    const emailContent = generatePickupReadyEmail(body);
    console.log('📧 Email de notificación enviado:', emailContent);

    // Simular envío de SMS/WhatsApp (en producción usarías Twilio, WhatsApp Business API, etc.)
    const smsContent = generatePickupReadySMS(body);
    console.log('📱 SMS de notificación enviado:', smsContent);

    return NextResponse.json({
      success: true,
      message: 'Notificaciones enviadas correctamente',
      notifications: {
        email: 'sent',
        sms: 'sent'
      }
    });

  } catch (error) {
    console.error('Error enviando notificaciones:', error);
    
    return NextResponse.json(
      { 
        error: 'Error al enviar notificaciones',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}

function generatePickupReadyEmail(data: NotificationRequest): string {
  return `
    Para: ${data.customerEmail}
    Asunto: 🎉 Tu pedido está listo para recoger - Código: ${data.pickupCode}
    
    Hola ${data.customerName},
    
    ¡Excelentes noticias! Tu pedido ya está disponible para recoger en nuestra tienda afiliada.
    
    📦 DETALLES DE RECOGIDA:
    • Código de recogida: ${data.pickupCode}
    • Tienda: ${data.storeName}
    • Dirección: ${data.storeAddress}
    • Teléfono: ${data.storePhone}
    
    📋 QUÉ NECESITAS TRAER:
    ✓ Tu código de recogida: ${data.pickupCode}
    ✓ Identificación oficial
    ✓ Este email (opcional)
    
    ⏰ HORARIOS DE ATENCIÓN:
    Lunes a Viernes: 9:00 - 19:00
    Sábado: 9:00 - 17:00
    Domingo: 10:00 - 15:00
    
    💡 CONSEJOS:
    • Llama antes de ir: ${data.storePhone}
    • Tu pedido estará reservado por 7 días
    • Si tienes dudas, responde a este email
    
    ¡Gracias por tu compra!
    
    Equipo Click & Collect
  `;
}

function generatePickupReadySMS(data: NotificationRequest): string {
  return `
    Para: ${data.customerName}
    
    🎉 ¡Tu pedido está listo!
    
    Código: ${data.pickupCode}
    Tienda: ${data.storeName}
    Tel: ${data.storePhone}
    
    Trae tu código e ID oficial.
    Reservado por 7 días.
    
    ¡Gracias por tu compra! 🛍️
  `;
}

// Endpoint GET para consultar el estado de notificaciones (opcional)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    
    if (!orderId) {
      return NextResponse.json(
        { error: 'ID de orden requerido' },
        { status: 400 }
      );
    }

    // Obtener estado actual de la orden
    const order = await client.fetch(`
      *[_type == "order" && _id == $orderId][0] {
        _id,
        orderNumber,
        pickupStatus,
        readyForPickupAt,
        customerName
      }
    `, { orderId });

    if (!order) {
      return NextResponse.json(
        { error: 'Orden no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        pickupStatus: order.pickupStatus,
        readyForPickupAt: order.readyForPickupAt,
        customerName: order.customerName
      }
    });

  } catch (error) {
    console.error('Error consultando estado de orden:', error);
    
    return NextResponse.json(
      { 
        error: 'Error al consultar estado',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}