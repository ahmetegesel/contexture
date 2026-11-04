# contexture v0.62.0: the base loader; workspaces overlay it via AGENTS.workspace.md, never edit this file
@boot
  1. FIRST: run .contexture/laws/compose from the workspace root; it composes the generated law layer .contexture/laws/AGENTS.generated.md or verifies it current. When .contexture/laws/compose is absent or not executable, or its core source .contexture/laws/core.md is absent or unreadable, stop and report the missing payload path; never boot on a stale or partial law layer.
  2. read .contexture/laws/AGENTS.generated.md WHOLE; it is the law layer: the laws, the record, and the boot. Never edit it.
  3. read AGENTS.workspace.md then AGENTS.local.md: the shared overlay and the local amendments; they amend the generated layer by section, never contradict it; where they conflict, the workspace wins. Then run the generated layer's @boot.
