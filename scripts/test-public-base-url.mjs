import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/urls.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const urlModule = { exports: {} };
new Function("exports", "module", compiled)(urlModule.exports, urlModule);
const { buildUrl, getPublicBaseUrl } = urlModule.exports;

const keys = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_BASE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "VERCEL_URL",
  "VERCEL_ENV",
];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

function setUrls(values) {
  for (const key of keys) {
    if (values[key]) process.env[key] = values[key];
    else delete process.env[key];
  }
}

try {
  setUrls({
    VERCEL_ENV: "preview",
    NEXT_PUBLIC_APP_URL: "https://staging.elmenu.site/",
    NEXT_PUBLIC_BASE_URL: "https://elmenu.site",
    NEXT_PUBLIC_SITE_URL: "https://wrong.example",
    VERCEL_URL: "en-escobedo-preview.vercel.app",
  });
  assert.equal(getPublicBaseUrl(), "https://staging.elmenu.site");
  assert.equal(
    buildUrl("/success?session_id={CHECKOUT_SESSION_ID}"),
    "https://staging.elmenu.site/success?session_id={CHECKOUT_SESSION_ID}"
  );

  setUrls({
    VERCEL_ENV: "production",
    NEXT_PUBLIC_BASE_URL: "https://elmenu.site/",
    NEXT_PUBLIC_SITE_URL: "https://wrong.example",
    VERCEL_URL: "en-escobedo-production.vercel.app",
  });
  assert.equal(buildUrl("/success"), "https://elmenu.site/success");

  setUrls({ VERCEL_URL: "en-escobedo-fallback.vercel.app/" });
  assert.equal(getPublicBaseUrl(), "https://en-escobedo-fallback.vercel.app");

  setUrls({ NEXT_PUBLIC_APP_URL: "javascript:alert(1)" });
  assert.throws(() => getPublicBaseUrl(), /http o https/);
} finally {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
}

console.log("public URL priority: ok");
