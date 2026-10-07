import type { Swatch } from "./types";
// Presentation only; variants and prices come from the commerce server.
const colors: Record<string, Swatch> = {
  "Ink black": {
    hex: "#202021",
    filter: "none",
  },
  "Soft graphite": {
    hex: "#57575b",
    filter: "grayscale(1) brightness(1.3)",
  },
  Champagne: {
    hex: "#d7c6a5",
    filter: "none",
  },
  Frost: {
    hex: "#e1e0da",
    filter: "grayscale(1)",
  },
  "Warm tortoise": {
    hex: "#80532c",
    filter: "none",
  },
  "Smoky tortoise": {
    hex: "#555451",
    filter: "grayscale(1)",
  },
  "Brushed gold": {
    hex: "#b8a063",
    filter: "none",
  },
  Silver: {
    hex: "#c0c0c0",
    filter: "grayscale(1)",
  },
  Forest: {
    hex: "#164d41",
    filter: "none",
  },
  "Deep teal": {
    hex: "#17585f",
    filter: "hue-rotate(35deg)",
  },
  Charcoal: {
    hex: "#4d4d4b",
    filter: "none",
  },
  Chestnut: {
    hex: "#834921",
    filter: "none",
  },
  Ash: {
    hex: "#747370",
    filter: "grayscale(1)",
  },
  Crystal: {
    hex: "#dddeda",
    filter: "none",
  },
  Midnight: {
    hex: "#26262a",
    filter: "none",
  },
  Havana: {
    hex: "#936031",
    filter: "none",
  },
  Smoke: {
    hex: "#66665f",
    filter: "grayscale(1)",
  },
  "Gold / amber": {
    hex: "#c3a969",
    filter: "none",
  },
  "Silver / smoke": {
    hex: "#a7a7a6",
    filter: "grayscale(1)",
  },
  Cobalt: {
    hex: "#2a5290",
    filter: "none",
  },
  Violet: {
    hex: "#635290",
    filter: "hue-rotate(45deg)",
  },
};
const neutral: Swatch = { hex: "#737373", filter: "none" };
export const swatchFor = (name: string): Swatch =>
  Object.hasOwn(colors, name) ? colors[name] : neutral;
