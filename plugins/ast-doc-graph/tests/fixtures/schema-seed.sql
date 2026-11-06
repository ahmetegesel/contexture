INSERT INTO docs (id, repo, kind, summary, sources, keywords)
VALUES ('doc:order-protocol', 'demo-shop', 'protocol', 'Order cascade protocol: the lifecycle and its phase transitions', '["backend/core/orderCore.ts", "backend/services/orderService.ts"]', '["cascade", "order", "lifecycle"]');

INSERT INTO rules (id, doc_id, statement, evidence_symbols, evidence_raw, detail, anti, good)
VALUES ('rule:phase-tracking', 'doc:order-protocol', 'Record the phase count on every check-out line', '["recordPhase", "setTotalLines"]', 'recordPhase; setTotalLines', 'Checkout lines must persist their phase count across restarts', 'Omitting the phase count update', 'Calling recordPhase on every checkout line');

INSERT INTO pitfalls (id, doc_id, severity, type, statement, trigger, evidence_symbols, evidence_raw)
VALUES ('pitfall:rounding-threshold', 'doc:order-protocol', 'high', 'gotcha', 'Price rounding diverges on unnormalized currency input', 'Amounts carrying a trailing currency marker', '["roundPrice", "normalizeAmount"]', 'roundPrice; normalizeAmount');

INSERT INTO symbols (id, name, qname, kind, file, line_start, line_end, signature, docstring)
VALUES ('sym:1', 'startOrder', 'OrderCore.startOrder', 'method', 'backend/core/orderCore.ts', 35, 78, '(config: OrderConfig) => OrderResult', 'Initializes the order cascade');

INSERT INTO symbols (id, name, qname, kind, file, line_start, line_end, signature, docstring)
VALUES ('sym:2', 'getNextPhase', 'OrderCore.getNextPhase', 'method', 'backend/core/orderCore.ts', 80, 115, '(phase: Phase) => Phase', 'Calculates the next phase');

INSERT INTO symbols (id, name, qname, kind, file, line_start, line_end, signature, docstring)
VALUES ('sym:3', 'startOrder', 'OrderService.startOrder', 'method', 'backend/services/orderService.ts', 55, 92, '(userId: string) => Promise<Order>', 'Service entry point for a new order');

INSERT INTO symbols (id, name, qname, kind, file, line_start, line_end, signature, docstring)
VALUES ('sym:4', 'runCheckout', 'runCheckout', 'function', 'simulation/checkoutRun.ts', 36, 111, '() => void', 'Simulates checkout runs');

INSERT INTO edges (source, target, kind) VALUES ('sym:4', 'sym:3', 'CALLS');
INSERT INTO edges (source, target, kind) VALUES ('sym:3', 'sym:1', 'CALLS');
INSERT INTO edges (source, target, kind) VALUES ('sym:1', 'sym:2', 'CALLS');
INSERT INTO edges (source, target, kind) VALUES ('sym:2', 'sym:1', 'CALLS');

INSERT INTO edges (source, target, kind) VALUES ('rule:phase-tracking', 'sym:1', 'GOVERNS');
INSERT INTO edges (source, target, kind) VALUES ('pitfall:rounding-threshold', 'sym:1', 'WARNS');
INSERT INTO edges (source, target, kind) VALUES ('doc:order-protocol', 'sym:1', 'COVERS');
