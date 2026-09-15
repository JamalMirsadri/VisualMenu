export type ItemKind = 'FOOD' | 'DRINK' | 'DESSERT' | 'OTHER';

const DRINK_RE = /drink|beverage|bebida|elixir|cocktail|mocktail|wine|beer|coffee|tea|juice|soda|smoothie|spirit|vinho|cafe|café|refresco|sumo/;
const DESSERT_RE = /dessert|sweet|sobremesa|pastry|cake|gelato|ice\s?cream|chocolate|bakery|pudim|torta|mousse|tart|pie|doce/;

const VALID_TYPES: ItemKind[] = ['FOOD', 'DRINK', 'DESSERT', 'OTHER'];

/**
 * Classifies a menu item for analytics/reporting.
 *
 * 1. If an explicit `analyticsType` is set on the product, it always wins.
 * 2. Otherwise a legacy heuristic over the category slug/name (and product name)
 *    is used as a fallback so pre-existing products (NULL analyticsType) keep
 *    the same behavior they had before the field was introduced.
 */
export function classifyItemKind(
  analyticsType: string | null | undefined,
  categorySlug: string,
  categoryName: string,
  foodName: string
): ItemKind {
  if (VALID_TYPES.includes(analyticsType as ItemKind)) {
    return analyticsType as ItemKind;
  }

  const haystack = `${categorySlug || ''} ${categoryName || ''} ${foodName || ''}`.toLowerCase();
  if (DRINK_RE.test(haystack)) return 'DRINK';
  if (DESSERT_RE.test(haystack)) return 'DESSERT';
  return 'FOOD';
}
