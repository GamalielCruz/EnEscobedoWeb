import { writeClient } from "./sanity/lib/client";

async function checkOrder() {
  const orderId = "2t02yp6piNjowebjmdc5QM";
  const order = await writeClient.fetch(`*[_id == $orderId || _id == "drafts." + $orderId][0]`, { orderId });
  console.log("Order Data:", JSON.stringify(order, null, 2));
}

checkOrder();
