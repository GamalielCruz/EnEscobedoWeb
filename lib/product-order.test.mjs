import assert from "node:assert/strict";
import { isCompleteOrder, orderProducts } from "./product-order.ts";

const products = [{ _id: "a" }, { _id: "b" }, { _id: "c" }, { _id: "d" }];

assert.deepEqual(
  orderProducts(products, ["c", "missing", "a", "c"]).map(({ _id }) => _id),
  ["c", "a", "b", "d"]
);
assert.deepEqual(products.map(({ _id }) => _id), ["a", "b", "c", "d"]);

assert.equal(isCompleteOrder(["a", "b"], ["b", "a"]), true);
assert.equal(isCompleteOrder(["a", "b"], ["a", "a"]), false);
assert.equal(isCompleteOrder(["a", "b"], ["a"]), false);

console.log("product-order: ok");
