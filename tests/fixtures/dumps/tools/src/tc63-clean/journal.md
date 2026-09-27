@anchor A1 ("continues A0", attention: clean fixture)

@entry 2026-09-20-asked
  ANCHOR: A1
  WHAT: "a question to the human, answered below"
  THREAD: the human's answer

@entry 2026-09-20-open
  ANCHOR: A1
  WHAT: "a dispatch still awaited"
  THREAD: lane review report

@entry 2026-09-20-answered
  ANCHOR: A1
  WHAT: "the human answered"
  THREAD: none
  CLOSES: 2026-09-20-asked (done: the human answered)
