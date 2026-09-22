@doc capability order-flow
  repo: demo-orders
  description: "Cart validation, pricing, and order persistence for the demo storefront"
  sources: [src/order/**, src/pricing/**]
  keywords: [orders, checkout, pricing, validation]

@responsibilities
  - "Validate every submitted cart against stock and pricing rules"
  - "Persist accepted orders and publish the order-accepted event"

@contract
  - rule: "A cart naming an unknown item id is rejected with a typed validation error"
    evidence: "validateCart"
    detail ::
      Unknown ids never reach persistence; the caller receives the offending id list.
  - rule: "Prices are computed from the server-side price table, never from client totals"
    evidence: "priceCart"

@edges
  - direction: exposes
    via: http
    key: "POST /orders"
    detail: "Accepts the cart payload from the storefront and returns the accepted order id."
  - direction: consumes
    via: amqp
    key: "orders.accepted"
    detail: "Publishes accepted orders downstream."

@pitfalls
  - id: order-flow-p1
    summary: "A retried checkout can persist the same cart twice"
    class: bug
    severity: high
    trigger: "The storefront retries POST /orders after a timeout while the first request is still in flight"
    consequence ::
      The same cart is stored as two orders and the customer sees a duplicate charge.
    evidence: "validateCart"
  - id: order-flow-p2
    summary: "A price edited between validation and persistence is applied inconsistently"
    class: drift-risk
    severity: medium
    trigger: "The price table changes while a checkout request is in flight"
    consequence ::
      The accepted order carries the older price while the receipt shows the newer one.
    evidence: "priceCart"

@see_also
  - ref: operational
    why: "Run, build, and test procedures for this repository"
