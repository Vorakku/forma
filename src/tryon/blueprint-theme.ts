export type BlueprintTheme = "ink" | "blue";
export const BLUEPRINT_THEME_KEY = "forma.v2.blueprintTheme";
export const BLUEPRINT_TOKENS = [
  "sheet",
  "grid",
  "fill",
  "fill-opacity",
  "lens",
  "lens-opacity",
  "line",
  "hidden",
  "hidden-opacity",
] as const;
export type BlueprintTokens = Record<(typeof BLUEPRINT_TOKENS)[number], string>;

export function readBlueprintTokens(style: {
  getPropertyValue(name: string): string;
}): BlueprintTokens {
  return Object.fromEntries(
    BLUEPRINT_TOKENS.map((name) => [
      name,
      style.getPropertyValue(`--blueprint-${name}`).trim(),
    ]),
  ) as BlueprintTokens;
}

export function readBlueprintTheme(
  storage: () => Pick<Storage, "getItem">,
): BlueprintTheme {
  try {
    return storage().getItem(BLUEPRINT_THEME_KEY) === "blue" ? "blue" : "ink";
  } catch {
    return "ink";
  }
}
export function saveBlueprintTheme(
  storage: () => Pick<Storage, "setItem">,
  theme: BlueprintTheme,
) {
  try {
    storage().setItem(BLUEPRINT_THEME_KEY, theme);
  } catch {
    /* Private/blocked storage keeps the in-memory choice. */
  }
}
