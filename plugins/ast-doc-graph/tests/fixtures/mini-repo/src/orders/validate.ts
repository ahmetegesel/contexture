import { priceCart } from './price';

export interface Cart {
  items: number[];
}

export function validateCart(cart: Cart): boolean {
  return cart.items.length > 0 && priceCart(cart) >= 0;
}
