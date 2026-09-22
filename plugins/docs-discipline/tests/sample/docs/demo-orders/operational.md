@doc operational operational
  repo: demo-orders
  description: "Run, build, test, debug, and observe the demo order service"
  sources: [package.json, .nvmrc, src/server.ts]
  keywords: [run, build, test, toolchain, node]

@run
  - step: "Install dependencies"
    evidence: "package.json"
    detail ::
      Run `npm install` at the repository root. `.nvmrc` pins Node 20, so switch to it before installing.
  - step: "Start the dev server"
    evidence: "src/server.ts"
    detail ::
      Run `npm run dev`; the service listens on port 4100 and reloads on source changes.

@build
  - step: "Compile the service"
    evidence: "package.json"
    detail ::
      Run `npm run build`; the compiled output lands in dist/.
  - step: "Package the container"
    evidence: "Dockerfile"
    detail ::
      Run `docker build -t demo-orders .` after a clean build.

@test
  - step: "Run the unit suite"
    evidence: "package.json"
    detail ::
      Run `npm test`; the suite covers validation and pricing.
  - step: "Run the checkout integration test"
    evidence: "src/order/checkout.test.ts"
    detail ::
      Run `npm run test:checkout` against a local database.

@debug
  - step: "Attach the debugger"
    evidence: "src/server.ts"
    detail ::
      Start with `npm run dev:debug`; the inspector listens on port 9229.

@observability
  - step: "Health endpoint"
    evidence: "src/server.ts"
    detail ::
      GET /health returns 200 while the service and database are reachable.
