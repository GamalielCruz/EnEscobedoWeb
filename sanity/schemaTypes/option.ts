import { defineType } from 'sanity'

export const option = defineType({
  name: 'option',
  title: 'Option',
  type: 'object',
  fields: [
    { name: 'label', title: 'Label', type: 'string' },
    { name: 'description', title: 'Description', type: 'string' },
    { name: 'priceDelta', title: 'Price Delta', type: 'number' },
    { name: 'isDefault', title: 'Is Default', type: 'boolean' },
  ],
})
