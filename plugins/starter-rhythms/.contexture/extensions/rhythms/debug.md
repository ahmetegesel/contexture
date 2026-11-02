@rhythm debug
  use when: a failure needs root-cause: a bug, a flaky test, an unexpected behavior
  activation: propose
  1. REPRODUCE: a red reproduction exists and is recorded (a REF); the error read whole; the record consulted first
  2. TRACE: root-cause trace to the original trigger; recent changes checked; boundaries instrumented
  3. HYPOTHESIS: one minimal hypothesis at a time, its prediction stated; three failed fixes stop the loop and question the architecture with the human
  4. FIX: one fix at the root, never the symptom; defense-in-depth where the layer warrants; the fix lands with its record
  5. VERIFY: the reproduction passes; regressions checked; evidence fresh; the mechanical checks where the change carries them
  6. REFRESH: run @refresh
