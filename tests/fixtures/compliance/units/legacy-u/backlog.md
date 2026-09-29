# backlog grammar
tasks at column 0; fields indent 2.

@task canon-task
  STATUS: TODO
  OBJECTIVE: "A canonical task"
  REFS: [journal#2026-09-20-legacy-one, knowledge#LEGACY_CANON]
  DESCRIPTION ::
    First line of the description.

    Third line after an empty line.
  ACCEPTANCE CRITERIA ::
    1. the criteria line

@task bare-refs-task
  STATUS: TODO
  OBJECTIVE: "Bare REFS carried"
  REFS: journal#2026-09-20-legacy-one knowledge#LEGACY_CANON

@task four-space-blank
  STATUS: DONE
  OBJECTIVE: "The serializer's four space blank body line"
  DESCRIPTION ::
    before
    
    after

@note an opaque item in the backlog
  free text the grammar does not know

@task statusless-task
  OBJECTIVE: "A legacy task without STATUS"
