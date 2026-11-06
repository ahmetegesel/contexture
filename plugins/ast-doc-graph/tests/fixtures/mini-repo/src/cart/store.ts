export class CartStore {
  private saved = 0;

  save(): number {
    this.saved += 1;
    return this.saved;
  }
}
