export type DeploymentEnvironment = "development" | "preview" | "production";

export function getDeploymentEnvironment(): DeploymentEnvironment {
  const value = process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV;
  return value === "production" ? "production" : value === "preview" ? "preview" : "development";
}

export function isProductionDeployment() {
  return getDeploymentEnvironment() === "production";
}

export function getExpectedSanityDataset() {
  return isProductionDeployment() ? "production" : "test";
}

export function assertProductionIntegration(name: string) {
  if (!isProductionDeployment()) {
    throw new Error(`${name} está deshabilitado fuera de producción`);
  }
}

export function assertSafeDeploymentConfiguration() {
  if (isProductionDeployment()) return;

  const liveCredentials = [
    ["STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY, "sk_live_"],
    ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, "pk_live_"],
    ["CLERK_SECRET_KEY", process.env.CLERK_SECRET_KEY, "sk_live_"],
    ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, "pk_live_"],
  ] as const;

  const unsafe = liveCredentials.find(([, value, prefix]) => value?.startsWith(prefix));
  if (unsafe) {
    throw new Error(`${unsafe[0]} de producción no puede usarse en ${getDeploymentEnvironment()}`);
  }
}
