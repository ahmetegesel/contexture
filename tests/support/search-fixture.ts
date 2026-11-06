export const SEARCH_DATA: Record<string, string> = {
  searchdoc: [
    'namespace: searchdoc', 'root: sd-root', 'suffix: .txt', 'key: <unit>/<path...>', 'changes: false', 'search: documents', 'modes: exact, hybrid, trigram',
    'document: <unit>/state state session -', 'document: <unit>/backlog backlog session -', 'document: <unit>/backlog backlog task @task',
    'document: <unit>/journal journal session -', 'document: <unit>/journal journal entry @entry', 'document: <unit>/journal journal session @anchor',
    'document: <unit>/lanes/<lane>/recipe lane_recipe lane -', 'document: <unit>/lanes/<lane>/journal lane_journal lane -',
    'document: <unit>/lanes/<lane>/journal lane_journal lane_entry @entry', 'document: <unit>/lanes/<lane>/report lane_report lane -', '',
  ].join('\n'),
  flatdoc: 'namespace: flatdoc\nroot: flat-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\nsearch: flat\nformat: text\nmodes: exact, hybrid\n',
  genericdoc: 'namespace: genericdoc\nroot: generic-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\nmodes: exact, hybrid\n',
  jsondoc: 'namespace: jsondoc\nroot: json-root\nsuffix: .json\nkey: <a>/<b>\nchanges: false\nsearch: flat\nformat: json\nfields: title, body\ntitle: title\nmodes: exact, hybrid\n',
};

export const SEARCH_VALUES: Record<string, [string, string][]> = {
  searchdoc: [
    ['u1/backlog', '# period note\n\n@task alpha\n  STATUS: TODO\n  OBJECTIVE: "First thing"\n\n@task beta\n  STATUS: TODO\n  OBJECTIVE: "Second needle"\n'],
    ['u1/journal', '@anchor A1 2026-11-02\n\n@entry 2026-11-02-event-1\n  ANCHOR: A1\n  WHAT: "needle in the journal"\n  THREAD: none\n'],
    ['u1/lanes/l1/report', 'Report about a needle\nsecond line\n'],
    ['u1/state', 'status: ACTIVE\ncurrent_anchor: A1\nnext_action: "work"\nobjective: "test"\nrepos: []\n'],
  ],
  flatdoc: [['f1/x', 'flat needle value\n']],
  genericdoc: [['g1/x', 'generic needle value\n']],
  jsondoc: [['j1/x', '{"title":"Needle title","body":"body needle"}\n']],
};

export const row = (key: string, type: string, id: string, section: string, snippet: string) =>
  `{"key":"${key}","entity_type":"${type}","entity_id":"${id}","section":"${section}","snippet":${JSON.stringify(snippet)},"score":0}`;
export const searchAnswer = (ns: string, query: string, total: number, rows: string[]) =>
  `{"namespace":"${ns}","query":"${query}","mode":"exact","total_matches":${total},"results":[${rows.join(',')}]}\n`;

export const NEEDLE_ROWS = [
  row('u1/backlog', 'task', 'beta', 'backlog', 'Second needle'),
  row('u1/journal', 'entry', '2026-11-02-event-1', 'journal', 'needle in the journal'),
  row('u1/lanes/l1/report', 'lane', 'u1/lanes/l1/report', 'lane_report', 'Report about a needle'),
];

