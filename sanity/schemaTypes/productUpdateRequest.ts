import { defineField, defineType } from "sanity";

export const productUpdateRequest = defineType({
  name: "productUpdateRequest",
  title: "Product Update Request",
  type: "document",
  fields: [
    defineField({ name: "product", title: "Product", type: "reference", to: [{ type: "product" }], validation: (Rule) => Rule.required() }),
    defineField({ name: "changes", title: "Changed Fields", type: "object", description: "Fields proposed to change", fields: [
      defineField({ name: "name", title: "Name", type: "string" }),
      defineField({ name: "price", title: "Price", type: "number" }),
      defineField({ name: "stock", title: "Stock", type: "number" }),
      defineField({ name: "allowSpecialInstructions", title: "Allow Special Instructions", type: "boolean" }),
      defineField({ name: "acceptsAllergyRequests", title: "Accept Allergy Requests", type: "boolean" }),
      defineField({ name: "description", title: "Description", type: "blockContent" }),
      defineField({ name: "image", title: "Image", type: "image" }),
      defineField({ name: "categories", title: "Categories", type: "array", of: [{ type: "reference", to: [{ type: "category" }] }] }),
      defineField({ name: "optionGroups", title: "Option Groups", type: "array", of: [{ type: "optionGroup" }] }),
    ] }),
    defineField({ name: "status", title: "Status", type: "string", options: { list: [{ title: "Pending", value: "pending" }, { title: "Approved", value: "approved" }, { title: "Rejected", value: "rejected" }], layout: "radio" }, initialValue: "pending" }),
    defineField({ name: "submittedBy", title: "Submitted By", type: "string" }),
    defineField({ name: "submittedAt", title: "Submitted At", type: "datetime" }),
    defineField({ name: "approvedBy", title: "Approved By", type: "string" }),
    defineField({ name: "approvedAt", title: "Approved At", type: "datetime" }),
    defineField({ name: "rejectedBy", title: "Rejected By", type: "string" }),
    defineField({ name: "rejectedAt", title: "Rejected At", type: "datetime" }),
    defineField({ name: "rejectionReason", title: "Rejection Reason", type: "string" }),
  ],
});
