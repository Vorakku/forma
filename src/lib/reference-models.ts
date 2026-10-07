// Keep availability separate from the builders so galleries do not eagerly load Three.js.
const REFERENCE_MODEL_SLUGS = ["the-ellis", "the-felix"] as const;
export type ReferenceModelSlug = (typeof REFERENCE_MODEL_SLUGS)[number];
export function hasReferenceModel(slug: string): slug is ReferenceModelSlug {
  return REFERENCE_MODEL_SLUGS.some((reference) => reference === slug);
}
