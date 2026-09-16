@task install-and-run-local
  STATUS: IN_PROGRESS
  OBJECTIVE: "Install the local toolchain and run the demo-orders service before the pricing change lands"
  REFS: [docs/demo-orders/operational.md]
  DESCRIPTION ::
    Set up the environment, run the build, and test the checkout path on demo-orders.
  ACCEPTANCE CRITERIA ::
    - the suite is green
