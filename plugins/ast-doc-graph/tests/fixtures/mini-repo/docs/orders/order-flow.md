@doc capability order-flow
  repo: orders
  description: "Cart validation and pricing for the mini repository"
  sources: [src/orders/**]
  keywords: [orders, pricing]

@contract
  - rule: "A cart is validated before it is priced"
    id: order-flow-r1
    evidence: "validateCart"
  - rule: "Totals are rounded once, at the end"
    id: order-flow-r2
    evidence: "roundTotal"

@pitfalls
  - id: order-flow-p1
    summary: "A huge total re-enters the pricing loop"
    class: gotcha
    severity: medium
    trigger: "A total above the rounding bound"
    consequence: "The pricing recursion runs once more with an empty cart"
    evidence: "priceCart"
