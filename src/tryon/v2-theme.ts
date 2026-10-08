export type V2Theme = "day" | "night";
export const V2_THEME_KEY = "forma.v2.theme";

export function readV2Theme(storage: () => Pick<Storage, "getItem">): V2Theme {
  try {
    return storage().getItem(V2_THEME_KEY) === "night" ? "night" : "day";
  } catch {
    return "day";
  }
}

export function saveV2Theme(storage: () => Pick<Storage, "setItem">, theme: V2Theme) {
  try {
    storage().setItem(V2_THEME_KEY, theme);
  } catch {
    // The demo remains usable when browser storage is unavailable.
  }
}
