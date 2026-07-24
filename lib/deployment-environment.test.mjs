import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSafeDeploymentConfiguration,
  getDeploymentEnvironment,
  getExpectedSanityDataset,
} from "./deployment-environment.ts";

const keys = [
  "VERCEL_ENV",
  "NEXT_PUBLIC_VERCEL_ENV",
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
];

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => delete process.env[key]);
  Object.assign(process.env, values);
  try {
    callback();
  } finally {
    keys.forEach((key) => delete process.env[key]);
    Object.entries(previous).forEach(([key, value]) => {
      if (value !== undefined) process.env[key] = value;
    });
  }
}

test("production usa production y preview/local usan test", () => {
  withEnvironment({ VERCEL_ENV: "production" }, () => {
    assert.equal(getDeploymentEnvironment(), "production");
    assert.equal(getExpectedSanityDataset(), "production");
  });
  withEnvironment({ VERCEL_ENV: "preview" }, () => {
    assert.equal(getDeploymentEnvironment(), "preview");
    assert.equal(getExpectedSanityDataset(), "test");
  });
  withEnvironment({}, () => {
    assert.equal(getDeploymentEnvironment(), "development");
    assert.equal(getExpectedSanityDataset(), "test");
  });
});

test("una llave live falla fuera de producción", () => {
  withEnvironment({ VERCEL_ENV: "preview", STRIPE_SECRET_KEY: "sk_live_example" }, () => {
    assert.throws(assertSafeDeploymentConfiguration, /STRIPE_SECRET_KEY/);
  });
  withEnvironment({ VERCEL_ENV: "production", STRIPE_SECRET_KEY: "sk_live_example" }, () => {
    assert.doesNotThrow(assertSafeDeploymentConfiguration);
  });
});
