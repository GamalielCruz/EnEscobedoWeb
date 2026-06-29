import type { StructureResolver } from "sanity/structure";

// https://www.sanity.io/docs/structure-builder-cheat-sheet
export const structure: StructureResolver = (S) =>
  S.list()
    .title("Galiel - Pedro Escobedo")
    .items([
      S.documentTypeListItem("category").title("Categories"),
      S.documentTypeListItem("promoBanner").title("Banners Promocionales"),
      S.divider(),
      S.listItem()
        .title("Solicitudes Pendientes")
        .schemaType("productUpdateRequest")
        .child(
          S.documentList()
            .title("Solicitudes Pendientes de Aprobación")
            .schemaType("productUpdateRequest")
            .filter('_type == "productUpdateRequest" && status == "pending"')
            .defaultOrdering([{ field: "submittedAt", direction: "desc" }])
        ),
      S.divider(),
      ...S.documentTypeListItems().filter(
        (item) => item.getId() && !["category", "productUpdateRequest"].includes(item.getId()!)
      ),
    ]);
