@doc architecture system-map
  repo: workspace
  description: "The demo workspace map: two fictional product repos, their components, request stages, and data flow"
  keywords: [workspace map, demo, components, stages, data flow]

@components
  - name: "demo-web"
    repo: demo-web
    kind: capability
    stack: "TypeScript, browser runtime"
    responsibilities: "Storefront cart interaction and checkout handoff"
    sources: [projects/demo-web/src/**]
  - name: "demo-orders"
    repo: demo-orders
    kind: capability
    stack: "TypeScript, Node 20"
    responsibilities: "Cart validation, pricing, and order persistence"
    sources: [projects/demo-orders/src/**]

@stages
  - stage: "Cart assembly"
    order: 1
    description: "The customer edits a cart in the storefront"
    evidence: "cartStore"
  - stage: "Checkout"
    order: 2
    description: "The order service validates and prices the submitted cart"
    evidence: "validateCart"
  - stage: "Persistence"
    order: 3
    description: "The accepted order is stored and published downstream"
    evidence: "saveOrder"

@data_flow
  - from: "demo-web"
    to: "demo-orders"
    evidence: "postCheckout"
    detail ::
      The storefront posts the cart to the order API and renders the accepted order id.

@dependency_rules
  - rule: "The storefront never writes order state directly; only the order API persists."
    evidence: "cartStore"
    detail ::
      All order writes pass through the order API contract.
