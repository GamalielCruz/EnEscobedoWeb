import { defineType } from 'sanity'

export const optionGroup = defineType({
  name: 'optionGroup',
  title: 'Option Group',
  type: 'object',
  fields: [
    { name: 'title', title: 'Title', type: 'string' },
    { name: 'description', title: 'Description', type: 'string' },
    { name: 'required', title: 'Required', type: 'boolean' },
    { name: 'selectionType', title: 'Selection Type', type: 'string' },
    { name: 'options', title: 'Options', type: 'array', of: [{ type: 'option' }] },
  ],
})
