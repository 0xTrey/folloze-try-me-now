/** A category names a market, not the product whose behavior we can explain. */
export function isBroadProductCategory(value: string): boolean {
  return /^(?:software|computers?\s*(?:&|and)\s*electronics|technology|saas|platform|information technology|business services)$/i.test(value.trim());
}

export const PRODUCT_CLARIFICATION = "What specific product or offer should this journey explain?";
