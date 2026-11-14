export function isChromium(brands: readonly { brand: string }[] | undefined, userAgent: string): boolean {
  if (brands && brands.length > 0) {
    return brands.some((b) => b.brand === "Chromium" || b.brand === "Google Chrome");
  }
  return /Chrome\/\d+/.test(userAgent);
}
