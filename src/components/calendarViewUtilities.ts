export function getContrastColor(hexColor: string, mode: "blackWhite" | "oklch" = "oklch"): string {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  switch (mode) {
    case "blackWhite":
      return luminance > 0.5 ? "#000000" : "#ffffff";
    case "oklch":
      // Keep the original hue/chroma and only shift lightness in OKLCH.
      return luminance > 0.5
        ? `oklch(from ${hexColor} ${0.3} c h)`
        : `oklch(from ${hexColor} ${0.85} c h)`;
  }
}
