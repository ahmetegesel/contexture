@doc capability cart-ui
  repo: demo-web
  description: "Storefront cart interaction: add, remove, quantity edits, and the checkout handoff"
  sources: [src/cart/**, src/checkout/**]
  keywords: [cart, storefront, checkout]

@responsibilities
  - "Own the cart interaction state: add, remove, and quantity edits"
  - "Hand the completed cart to the order API and render the result"

@contract
  - rule: "The cart state is the single source for the checkout payload"
    evidence: "cartStore"
  - rule: "A failed checkout keeps the cart intact for retry"
    evidence: "submitCheckout"

@edges
  - direction: consumes
    via: http
    key: "POST /orders"
    detail: "Posts the cart payload to the order API."

@pitfalls
  - id: cart-ui-p1
    summary: "A stale cart snapshot is posted after a failed checkout"
    class: bug
    severity: medium
    trigger: "Editing the cart while a checkout request is in flight"
    consequence ::
      The order API receives an outdated payload and prices it against the previous cart.
    evidence: "submitCheckout"

@see_also
  - ref: order-flow
    why: "The order API side of the checkout handoff"
