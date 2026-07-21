import assert from "node:assert/strict";
import { orderProducts } from "./product-order.ts";

const products = [{ _id: "a" }, { _id: "b" }, { _id: "c" }, { _id: "d" }];

assert.deepEqual(
  orderProducts(products, ["c", "missing", "a", "c"]).map(({ _id }) => _id),
  ["c", "a", "b", "d"]
);
assert.deepEqual(products.map(({ _id }) => _id), ["a", "b", "c", "d"]);

console.log("product-order: ok");
