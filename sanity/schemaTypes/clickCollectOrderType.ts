import { defineField, defineType } from 'sanity'

export const clickCollectOrderType = defineType({
  name: 'clickCollectOrder',
  title: 'Click & Collect Order',
  type: 'document',
  fields: [
    defineField({
      name: 'orderNumber',
      title: 'Order Number',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'pickupCode',
      title: 'Pickup Code',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'customerInfo',
      title: 'Customer Information',
      type: 'object',
      fields: [
        defineField({
          name: 'name',
          title: 'Customer Name',
          type: 'string',
          validation: (rule) => rule.required(),
        }),
        defineField({
          name: 'email',
          title: 'Email',
          type: 'string',
          validation: (rule) => rule.required().email(),
        }),
        defineField({
          name: 'clerkUserId',
          title: 'Clerk User ID',
          type: 'string',
          validation: (rule) => rule.required(),
        }),
        defineField({
          name: 'phone',
          title: 'Phone Number',
          type: 'string',
          validation: (rule) => rule.required(),
        }),
      ],
    }),
    defineField({
      name: 'storeInfo',
      title: 'Store Information',
      type: 'object',
      fields: [
        defineField({
          name: 'storeId',
          title: 'Store ID',
          type: 'string',
          validation: (rule) => rule.required(),
        }),
        defineField({
          name: 'storeName',
          title: 'Store Name',
          type: 'string',
          validation: (rule) => rule.required(),
        }),
        defineField({
          name: 'storeAddress',
          title: 'Store Address',
          type: 'string',
          validation: (rule) => rule.required(),
        }),
        defineField({
          name: 'storePhone',
          title: 'Store Phone',
          type: 'string',
        }),
      ],
    }),
    defineField({
      name: 'items',
      title: 'Order Items',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'productName',
              title: 'Product Name',
              type: 'string',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'productId',
              title: 'Product ID',
              type: 'string',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'quantity',
              title: 'Quantity',
              type: 'number',
              validation: (rule) => rule.required().min(1),
            }),
            defineField({
              name: 'price',
              title: 'Price at Time of Order',
              type: 'number',
              validation: (rule) => rule.required().min(0),
            }),
          ],
        },
      ],
      validation: (rule) => rule.required().min(1),
    }),
    defineField({
      name: 'totalAmount',
      title: 'Total Amount',
      type: 'number',
      validation: (rule) => rule.required().min(0),
    }),
    defineField({
      name: 'paymentMethod',
      title: 'Payment Method',
      type: 'string',
      options: {
        list: [
          { title: 'Cash on Pickup', value: 'cash_on_pickup' },
          { title: 'Card on Pickup', value: 'card_on_pickup' },
        ],
      },
      initialValue: 'cash_on_pickup',
    }),
    defineField({
      name: 'status',
      title: 'Order Status',
      type: 'string',
      options: {
        list: [
          { title: 'Pending', value: 'pending' },
          { title: 'Processing', value: 'processing' },
          { title: 'Ready for Pickup', value: 'ready_for_pickup' },
          { title: 'Completed', value: 'completed' },
          { title: 'Cancelled', value: 'cancelled' },
        ],
      },
      initialValue: 'pending',
    }),
    defineField({
      name: 'estimatedPickupDate',
      title: 'Estimated Pickup Date',
      type: 'string',
    }),
    defineField({
      name: 'readyAt',
      title: 'Ready At',
      type: 'datetime',
    }),
    defineField({
      name: 'pickedUpAt',
      title: 'Picked Up At',
      type: 'datetime',
    }),
    defineField({
      name: 'notes',
      title: 'Customer Notes',
      type: 'text',
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'updatedAt',
      title: 'Updated At',
      type: 'datetime',
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: {
      title: 'orderNumber',
      subtitle: 'customerInfo.name',
      status: 'status',
      store: 'storeInfo.storeName',
    },
    prepare(selection) {
      const { title, subtitle, status, store } = selection
      return {
        title: `Order ${title}`,
        subtitle: `${subtitle} - ${store} (${status})`,
      }
    },
  },
})