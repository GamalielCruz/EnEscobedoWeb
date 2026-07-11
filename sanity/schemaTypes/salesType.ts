import { TagIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const salesType = defineType({
  name: "sale",
  title: "Ventas",
  type: "document",
  icon: TagIcon,
  fields: [
    defineField({
      name: "title",
      type: "string",
      title: "Sale Title",
    }),
    defineField({
      name: "description",
      type: "text",
      title: "Sale Description",
    }),
    defineField({
      name: "discountAmount",
      type: "number",
      title: "Discount Amount",
      description: "Amount off in percentage or fixed value",
    }),
    defineField({
      name: "couponCode",
      type: "string",
      title: "Coupon Code",
    }),
    defineField({
      name: "validFrom",
      type: "datetime",
      title: "Valid From",
    }),
    defineField({
      name: "validUntil",
      type: "datetime",
      title: "Valid Until",
    }),
    defineField({
      name: "stripePromotionCodeId",
      type: "string",
      title: "Stripe Promotion Code ID",
      description: "ID promo_... de Stripe. No usar el codigo visible.",
    }),
    defineField({
      name: "autoApply",
      type: "boolean",
      title: "Aplicar automaticamente",
      initialValue: false,
    }),
    defineField({
      name: "allowedOrderTypes",
      type: "array",
      title: "Tipos de pedido permitidos",
      options: { list: [
        { title: "Delivery", value: "delivery" },
        { title: "Pickup", value: "pickup" },
      ] },
      of: [{ type: "string" }],
      validation: (Rule) => Rule.required().min(1),
      description: "Selecciona al menos un tipo de pedido.",
    }),
    defineField({
      name: "allowedPaymentMethods",
      type: "array",
      title: "Metodos de pago permitidos",
      options: { list: [
        { title: "Stripe / tarjeta", value: "stripe" },
      ] },
      of: [{ type: "string" }],
      validation: (Rule) => Rule.required().min(1),
      description: "Selecciona al menos un metodo de pago.",
    }),
    defineField({
      name: "allowedStores",
      type: "array",
      title: "Tiendas permitidas",
      of: [{ type: "reference", to: [{ type: "affiliateStore" }] }],
      validation: (Rule) => Rule.required().min(1),
      description: "Selecciona al menos una tienda.",
    }),
    defineField({
      name: "isActive",
      type: "boolean",
      title: "Is Active",
      description: "Toggle to active/deactivate the sale",
      initialValue: true,
    }),
  ],
  preview: {
    select: {
        title: "title",
        discountAmount: "discountAmount",
        couponCode: "couponCode",
        isActive: "isActive",
    },
    prepare(selection) {
        const { title, discountAmount, couponCode, isActive } = selection;
        const status = isActive ? "Active" : "Inactive";
        return {
            title,
            subtitle: `${discountAmount}% off - Code: ${couponCode} - ${status}`,
        };
    },
  },
});



