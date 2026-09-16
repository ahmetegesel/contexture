@doc architecture system-map
  repo: workspace
  description: "The demo workspace map: two fictional product repos, their layers, request stages, deployables, and data flow"
  keywords: [workspace map, demo, layers, deployables, data flow]

@layers
  - name: "Storefront"
    order: 1
    responsibilities: "Cart interaction and checkout handoff in the browser"
    allowed_dependencies: [Order Service]
    path_patterns: [projects/demo-web/src/**]
  - name: "Order Service"
    order: 2
    responsibilities: "Cart validation, pricing, and order persistence"
    allowed_dependencies: [Database]
    path_patterns: [projects/demo-orders/src/**]

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

@deployables
  - name: "demo-web"
    type: "Static Site"
    runtime: "Node 20"
    entrypoint: "projects/demo-web/src/main.ts"
    evidence: "buildStorefront"
    detail ::
      Ships the storefront bundle to the static host.
  - name: "demo-orders"
    type: "Web API"
    runtime: "Node 20"
    entrypoint: "projects/demo-orders/src/server.ts"
    evidence: "createOrderServer"
    detail ::
      Runs the order API beside the primary database.

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
