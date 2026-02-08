import { BasketIcon } from "@sanity/icons";
import { defineArrayMember, defineField, defineType } from "sanity";

export const orderType = defineType({
  name: "order",
  title: "Order",
  type: "document",
  icon: BasketIcon,
  fields: [
    defineField({
      name: "orderNumber",
      title: "Order Number",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "stripeCheckoutSessionId",
      title: "Stripe Checkout Session ID",
      type: "string",
    }),
    defineField({
      name: "stripeCustomerId",
      title: "Stripe Customer ID",
      type: "string",
      description: "Required for Stripe payments, optional for COD orders",
    }),
    defineField({
      name: "clerkUserId",
      title: "Store User ID",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "customerName",
      title: "Customer Name",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "email",
      title: "Customer Email",
      type: "string",
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: "phone",
      title: "Customer Phone",
      type: "string",
      description: "Customer phone number for delivery and order updates",
    }),
    defineField({
      name: "paymentMethod",
      title: "Payment Method",
      type: "string",
      options: {
        list: [
          { title: "Tarjeta de Crédito/Débito", value: "card" },
          { title: "OXXO", value: "oxxo" },
          { title: "Transferencia Bancaria SPEI", value: "bank_transfer" },
          { title: "Pago Contra Entrega", value: "cash_on_delivery" },
        ],
      },
      description: "Method used for payment",
    }),
    defineField({
      name: "stripePaymentIntentId",
      title: "Stripe Payment Intent ID",
      type: "string",
      description: "Required for Stripe payments, optional for COD orders",
    }),
    defineField({
      name: "products",
      title: "Products",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          fields: [
            defineField({
              name: "product",
              title: "Product Bought",
              type: "reference",
              to: [{ type: "product" }],
            }),
            defineField({
              name: "quantity",
              title: "Quantity Purchased",
              type: "number",
            }),
          ],
          preview: {
            select: {
              product: "product.name",
              quantity: "quantity",
              image: "product.image",
              price: "product.price",
              currency: "product.currency",
            },
            prepare(select) {
              return {
                title: `${select.product} x ${select.quantity}`,
                subtitle: `${select.price * select.quantity}`,
                media: select.image,
              };
            },
          },
        }),
      ],
    }),
    defineField({
      name: "totalPrice",
      title: "Total Price",
      type: "number",
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: "currency",
      title: "Currency",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "amountDiscount",
      title: "Amount Discount",
      type: "number",
      validation: (Rule) => Rule.min(0),
    }),
    defineField({
      name: "status",
      title: "Order Status",
      type: "string",
      options: {
        list: [
          { title: "Pending", value: "pending" },
          { title: "Paid", value: "paid" },
          { title: "Failed", value: "failed" },
          { title: "Expired", value: "expired" },
          { title: "Pending Delivery (COD)", value: "pending_delivery" },
          { title: "Pending Pickup (COD)", value: "pending_pickup" },
          { title: "Shipped", value: "shipped" },
          { title: "Delivered", value: "delivered" },
          { title: "Cancelled", value: "cancelled" },
          { title: "Ready for Pickup", value: "ready_for_pickup" },
          { title: "Picked Up", value: "picked_up" },
        ],
      },
    }),
    defineField({
      name: "expiredAt",
      title: "Expired At",
      type: "datetime",
      description: "When the order/payment expired (for OXXO payments)",
    }),
    defineField({
      name: "paidAt",
      title: "Paid At",
      type: "datetime",
      description: "When the payment was confirmed",
    }),
    defineField({
      name: "bankTransferReference",
      title: "Bank Transfer Reference",
      type: "string",
      description: "SPEI reference number for bank transfers",
    }),
    defineField({
      name: "bankTransferClabe",
      title: "Bank Transfer CLABE",
      type: "string",
      description: "CLABE number for SPEI transfers",
    }),
    defineField({
      name: "oxxoReference",
      title: "OXXO Reference Number",
      type: "string",
      description: "OXXO payment reference number for voucher",
    }),
    defineField({
      name: "orderDate",
      title: "Order Date",
      type: "datetime",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "subtotal",
      title: "Subtotal",
      type: "number",
      description: "Subtotal before shipping and taxes",
    }),
    defineField({
      name: "shippingCost",
      title: "Shipping Cost",
      type: "number",
      description: "Cost of shipping",
    }),
    defineField({
      name: "shippingAddress",
      title: "Shipping Address",
      type: "object",
      fields: [
        defineField({
          name: "line1",
          title: "Address Line 1",
          type: "string",
        }),
        defineField({
          name: "line2",
          title: "Address Line 2",
          type: "string",
        }),
        defineField({
          name: "city",
          title: "City",
          type: "string",
        }),
        defineField({
          name: "state",
          title: "State",
          type: "string",
        }),
        defineField({
          name: "postal_code",
          title: "Postal Code",
          type: "string",
        }),
        defineField({
          name: "country",
          title: "Country",
          type: "string",
        }),
      ],
    }),
    defineField({
      name: "codInstructions",
      title: "Cash on Delivery Instructions",
      type: "text",
      description: "Instructions for cash on delivery orders",
    }),
    defineField({
      name: "deliveryNotes",
      title: "Delivery Notes",
      type: "text",
      description: "Special notes for delivery",
    }),
    defineField({
      name: "deliveryMethod",
      title: "Método de Entrega",
      type: "string",
      options: {
        list: [
          { title: "Envío a Domicilio", value: "home_delivery" },
          { title: "Click & Collect", value: "click_collect" },
        ],
      },
      initialValue: "home_delivery",
    }),
    defineField({
      name: "pickupStore",
      title: "Tienda de Recogida",
      type: "reference",
      to: [{ type: "affiliateStore" }],
      hidden: ({ document }) => document?.deliveryMethod !== "click_collect",
      description: "Tienda afiliada donde el cliente recogerá su pedido",
    }),
    defineField({
      name: "estimatedPickupDate",
      title: "Fecha Estimada de Recogida",
      type: "datetime",
      hidden: ({ document }) => document?.deliveryMethod !== "click_collect",
      description: "Fecha estimada cuando el producto estará listo para recoger",
    }),
    defineField({
      name: "pickupStatus",
      title: "Estado de Recogida",
      type: "string",
      options: {
        list: [
          { title: "En Tránsito a Tienda", value: "in_transit" },
          { title: "Listo para Recoger", value: "ready_for_pickup" },
          { title: "Recogido", value: "picked_up" },
          { title: "No Recogido (Expirado)", value: "expired" },
        ],
      },
      hidden: ({ document }) => document?.deliveryMethod !== "click_collect",
    }),
    defineField({
      name: "pickupCode",
      title: "Código de Recogida",
      type: "string",
      hidden: ({ document }) => document?.deliveryMethod !== "click_collect",
      description: "Código único que el cliente debe presentar para recoger su pedido",
    }),
    defineField({
      name: "affiliateStore",
      title: "Tienda / Restaurante",
      type: "reference",
      to: [{ type: "affiliateStore" }],
      description: "Tienda o restaurante al que pertenece este pedido",
    }),
  ],
  preview: {
    select: {
      name: "customerName",
      amount: "totalPrice",
      currency: "currency",
      orderId: "orderNumber",
      email: "email",
    },
    prepare(select) {
      const orderIdSnippet = `${select.orderId.slice(0, 5)}...${select.orderId.slice(-5)}`;
      return {
        title: `${select.name} (${orderIdSnippet})`,
        subtitle: `${select.amount} ${select.currency}, ${select.email}`,
        media: BasketIcon,
      };
    },
  },
});
