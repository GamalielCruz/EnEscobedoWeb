import { getExpectedSanityDataset } from "../lib/deployment-environment";

export const apiVersion =
  process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2024-07-25'

const expectedDataset = getExpectedSanityDataset()
const configuredDatasets = [
  process.env.NEXT_PUBLIC_SANITY_DATASET,
  process.env.SANITY_STUDIO_DATASET,
].filter(Boolean)

if (configuredDatasets.some((value) => value !== expectedDataset)) {
  throw new Error(`Sanity debe usar el dataset "${expectedDataset}" en este entorno`)
}

export const dataset = expectedDataset

export const projectId = assertValue(
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID,
  'Missing environment variable: NEXT_PUBLIC_SANITY_PROJECT_ID'
)

if (
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID &&
  process.env.SANITY_STUDIO_PROJECT_ID &&
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID !== process.env.SANITY_STUDIO_PROJECT_ID
) {
  throw new Error('Sanity project IDs do not match')
}

function assertValue<T>(v: T | undefined, errorMessage: string): T {
  if (v === undefined) {
    throw new Error(errorMessage)
  }

  return v
}
