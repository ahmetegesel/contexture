@anchor A1 ("continues A0", attention: repeated slug fixture)

@entry 2026-09-20-repeat
  ANCHOR: A1
  WHAT: "first occurrence"
  THREAD: awaits the first answer

@entry 2026-09-20-between
  ANCHOR: A1
  WHAT: "an entry between"
  THREAD: none

@entry 2026-09-20-closer
  ANCHOR: A1
  WHAT: "closes the first occurrence"
  THREAD: none
  CLOSES: 2026-09-20-repeat (done: answered)

@entry 2026-09-20-after
  ANCHOR: A1
  WHAT: "an entry after the closer"
  THREAD: none

@entry 2026-09-20-repeat
  ANCHOR: A1
  WHAT: "second occurrence"
  THREAD: awaits the second answer
