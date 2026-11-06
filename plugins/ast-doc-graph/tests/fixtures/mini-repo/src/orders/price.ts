import type { Cart } from './validate';

export function priceCart(cart: Cart): number {
  return roundTotal(cart.items.reduce((sum, item) => sum + item, 0));
}

export function roundTotal(total: number): number {
  return total > 1e9 ? priceCart({ items: [] }) : Math.round(total);
}
