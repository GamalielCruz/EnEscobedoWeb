import { getCliClient } from "sanity/cli";
import { DEFAULT_COMMERCIAL_SETTINGS } from "../lib/commercial-rules";

const client = getCliClient({ apiVersion: "2024-07-25" });
const settingsId = "commercial-settings";

async function run() {
  await client.createIfNotExists({
    _id: settingsId,
    _type: "commercialSettings",
    ...DEFAULT_COMMERCIAL_SETTINGS,
    updatedAt: new Date().toISOString(),
    updatedBy: "migration",
  });

  const stores = await client.fetch<Array<{ _id: string }>>(
    `*[_type == "affiliateStore" && !defined(commercialPlanId)]{_id}`
  );
  const transaction = client.transaction();
  stores.forEach(({ _id }) =>
    transaction.patch(_id, (patch) =>
      patch.setIfMissing({
        commercialReviewRequired: true,
      })
    )
  );
  if (stores.length) await transaction.commit();

  console.log(
    `Configuración creada. ${stores.length} restaurantes conservaron su comportamiento y quedaron pendientes de revisión.`
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
