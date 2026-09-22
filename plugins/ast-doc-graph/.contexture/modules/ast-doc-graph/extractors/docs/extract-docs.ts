/**
 * Docs Corpus Extractor
 * Parses docs-discipline markdown files strictly according to .contexture/templates/doc.md grammar.
 * Emits intermediate JSONL conforming to plugins/ast-doc-graph/.contexture/modules/ast-doc-graph/spec.md.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// --- INTERFACES (conforming to spec.md) ---

export interface DocRecord {
  id: string;
  repo: string;
  kind: string;
  summary: string;
  sources: string[];
  keywords: string[];
}

export interface DocRuleRecord {
  id: string;
  doc_id: string;
  statement: string;
  evidence_symbols: string[];
  evidence_raw: string | null;
  detail: string | null;
  anti: string | null;
  good: string | null;
}

export interface DocPitfallRecord {
  id: string;
  doc_id: string;
  severity: string;
  type: string;
  statement: string;
  trigger: string | null;
  evidence_symbols: string[];
  evidence_raw: string | null;
  detail?: string | null;
}

export interface ParseResult {
  doc: DocRecord | null;
  rules: DocRuleRecord[];
  pitfalls: DocPitfallRecord[];
}

// --- UTILITIES ---

export function unquote(s: string): string {
  if (!s) return '';
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  }
  return s;
}

export function slugify(text: string, maxLen = 40): string {
  if (!text) return 'item';
  // Take text up to first colon, semicolon, or period if present
  const firstSentence = text.split(/[:;.]/)[0].trim();
  const cleaned = (firstSentence || text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!cleaned) return 'item';
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen).replace(/-+$/, '') : cleaned;
}

export function parseArray(val: string): string[] {
  if (!val) return [];
  let s = val.trim();
  if (s.startsWith('[') && s.endsWith(']')) {
    s = s.slice(1, -1);
  }
  return s
    .split(',')
    .map((x) => unquote(x.trim()))
    .filter((x) => x.length > 0);
}

// Language keywords to exclude from bare symbol matches
const EXCLUDED_KEYWORDS = new Set([
  'import', 'export', 'class', 'const', 'let', 'var', 'from', 'and', 'or', 'in', 'at',
  'to', 'over', 'finds', 'matches', 'exits', 'returns', 'with', 'true', 'false', 'null',
  'undefined', 'as', 'function', 'new', 'is', 'not', 'for', 'while', 'if', 'else', 'then',
  'case', 'switch', 'default', 'break', 'continue', 'return', 'throw', 'try', 'catch', 'finally',
  'typeof', 'instanceof', 'void', 'delete', 'interface', 'type', 'enum', 'implements',
  'public', 'private', 'protected', 'readonly', 'static', 'async', 'await', 'yield',
  'package', 'json', 'npm', 'run', 'git', 'log', 'test', 'build', 'lint', 'serve'
]);

function isFilePath(token: string): boolean {
  if (token.includes('/') || token.includes('\\')) return true;
  if (/\.(ts|tsx|js|jsx|json|md|sh|awk|css|html|yml|yaml|plist|template)$/i.test(token)) return true;
  return false;
}

/**
 * Extracts clean code symbols from evidence declarations.
 * Splits on semicolons and commas, strips parenthetical notes,
 * filters bare file paths, and captures valid code identifiers / qnames.
 */
export function extractEvidenceSymbols(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let s = raw.trim();
  const symbols = new Set<string>();

  // 1. Extract symbol groups from parentheses if all tokens are valid identifiers:
  // e.g. "tools/content-land/generationState.ts (projectGenerationState, parseGenerationStateDoc, runCli)"
  const parenMatches = Array.from(s.matchAll(/\(([^)]+)\)/g));
  for (const m of parenMatches) {
    const inside = m[1].trim();
    const parts = inside.split(/,\s*/);
    let allIdentifiers = true;
    for (const p of parts) {
      const cleanP = p.trim().replace(/^[`'"]|[`'"]$/g, '');
      if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*$/.test(cleanP)) {
        allIdentifiers = false;
        break;
      }
    }
    if (allIdentifiers && parts.length > 0) {
      for (const p of parts) {
        const cleanP = p.trim().replace(/^[`'"]|[`'"]$/g, '');
        if (cleanP && !EXCLUDED_KEYWORDS.has(cleanP)) {
          symbols.add(cleanP);
        }
      }
    }
  }

  // 2. Strip all parenthetical content from main string to avoid confusing splitting
  s = s.replace(/\([^)]*\)/g, ' ');

  // 3. Split by semicolons
  const chunks = s.split(/;\s*/);

  function addIfSymbol(cand: string) {
    let sym = cand.trim();
    sym = sym.replace(/[.,;:!?]+$/, '');
    sym = sym.replace(/\(\)$/, '');
    sym = sym.replace(/!$/, ''); // e.g. activeEpisode!
    sym = sym.replace(/^[`'"]|[`'"]$/g, '');

    if (sym.includes('#')) {
      const parts = sym.split('#');
      sym = parts[parts.length-1];
    }

    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*$/.test(sym)) {
      if (!EXCLUDED_KEYWORDS.has(sym)) {
        symbols.add(sym);
      }
    }
  }

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    // Remove "in <path>" or "at <path>" tails
    let expr = trimmed;
    const inMatch = expr.match(/^(.+?)\s+(?:in|at)\s+/);
    if (inMatch) {
      expr = inMatch[1];
    }

    // Split tokens by whitespace
    const tokens = expr.split(/\s+/);
    for (const tok of tokens) {
      if (isFilePath(tok)) {
        if (tok.includes('#')) {
          addIfSymbol(tok);
        }
        continue;
      }
      addIfSymbol(tok);
    }
  }

  return Array.from(symbols);
}

// --- PARSER ---

export function parseDocMarkdown(content: string, filePath: string, projectRoot?: string): ParseResult {
  const lines = content.split(/\r?\n/);

  let docHeader: {
    kind: string;
    slug: string;
    repo?: string;
    role?: string;
    description?: string;
    sources: string[];
    keywords: string[];
  } | null = null;

  const rules: DocRuleRecord[] = [];
  const pitfalls: DocPitfallRecord[] = [];

  // Track rule slugs to ensure unique IDs per doc
  const seenRuleSlugs = new Set<string>();

  // Determine doc id prefix
  // Default doc id format: doc:<repo>:<slug> or doc:<relPathNoExt>
  function computeDocId(): string {
    if (!docHeader) return 'doc:unknown';
    const slug = docHeader.slug;
    const repo = docHeader.repo || 'unknown';

    if (projectRoot && filePath) {
      const rel = path.relative(projectRoot, filePath);
      let cleanRel = rel.replace(/\.md$/i, '');
      if (cleanRel.startsWith('docs/')) {
        cleanRel = cleanRel.slice('docs/'.length);
      }
      if (cleanRel.includes('/')) {
        return `doc:${cleanRel.replace(/\//g, ':')}`;
      }
    }
    return `doc:${repo}:${slug}`;
  }

  // Parse state machine
  type BlockKind = 'NONE' | 'DOC' | 'CONTRACT' | 'RULE' | 'PITFALLS' | 'OTHER';
  let currentBlock: BlockKind = 'NONE';

  // Sub-entity accumulators
  let currentRule: {
    statement: string;
    evidenceRaw: string | null;
    detail: string | null;
    anti: string | null;
    good: string | null;
    slug?: string;
  } | null = null;

  let currentPitfall: {
    id: string;
    severity: string;
    type: string;
    statement: string;
    trigger: string | null;
    evidenceRaw: string | null;
    detail: string | null;
  } | null = null;

  let multilineScalar: {
    target: 'DOC_DESC' | 'RULE_DETAIL' | 'PITFALL_DETAIL';
    indent: number;
    lines: string[];
  } | null = null;

  function flushScalar() {
    if (!multilineScalar) return;
    const joined = multilineScalar.lines.join('\n').trim();
    if (multilineScalar.target === 'DOC_DESC' && docHeader) {
      docHeader.description = joined;
    } else if (multilineScalar.target === 'RULE_DETAIL' && currentRule) {
      currentRule.detail = joined;
    } else if (multilineScalar.target === 'PITFALL_DETAIL' && currentPitfall) {
      currentPitfall.detail = joined;
    }
    multilineScalar = null;
  }

  function flushRule() {
    if (!currentRule || !currentRule.statement) {
      currentRule = null;
      return;
    }
    const docId = computeDocId();
    const docSlug = docHeader ? docHeader.slug : 'doc';

    let ruleSlug = currentRule.slug || slugify(currentRule.statement);
    if (seenRuleSlugs.has(ruleSlug)) {
      let counter = 2;
      while (seenRuleSlugs.has(`${ruleSlug}-${counter}`)) {
        counter++;
      }
      ruleSlug = `${ruleSlug}-${counter}`;
    }
    seenRuleSlugs.add(ruleSlug);

    rules.push({
      id: `rule:${docSlug}:${ruleSlug}`,
      doc_id: docId,
      statement: currentRule.statement,
      evidence_symbols: extractEvidenceSymbols(currentRule.evidenceRaw),
      evidence_raw: currentRule.evidenceRaw,
      detail: currentRule.detail,
      anti: currentRule.anti,
      good: currentRule.good,
    });
    currentRule = null;
  }

  function flushPitfall() {
    if (!currentPitfall || !currentPitfall.statement) {
      currentPitfall = null;
      return;
    }
    const docId = computeDocId();
    const docSlug = docHeader ? docHeader.slug : 'doc';

    let rawId = currentPitfall.id.trim();
    if (rawId.startsWith('pitfall:')) {
      rawId = rawId.slice('pitfall:'.length);
    }
    // Strip docSlug prefix if present (e.g. cascade-protocol-p1 -> p1)
    let pitSlug = rawId;
    const prefixRegex = new RegExp(`^${docSlug}[-:]?`);
    if (prefixRegex.test(pitSlug)) {
      pitSlug = pitSlug.replace(prefixRegex, '');
    }
    if (!pitSlug) pitSlug = rawId;

    pitfalls.push({
      id: `pitfall:${docSlug}:${pitSlug}`,
      doc_id: docId,
      severity: currentPitfall.severity || 'medium',
      type: currentPitfall.type || 'gotcha',
      statement: currentPitfall.statement,
      trigger: currentPitfall.trigger,
      evidence_symbols: extractEvidenceSymbols(currentPitfall.evidenceRaw),
      evidence_raw: currentPitfall.evidenceRaw,
      detail: currentPitfall.detail,
    });
    currentPitfall = null;
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex];

    // Handle multiline scalar collection
    if (multilineScalar) {
      const matchIndent = rawLine.match(/^(\s*)/);
      const indent = matchIndent ? matchIndent[1].length : 0;
      if (rawLine.trim() === '') {
        multilineScalar.lines.push('');
        continue;
      }
      if (indent > multilineScalar.indent) {
        multilineScalar.lines.push(rawLine.trim());
        continue;
      } else {
        flushScalar();
      }
    }

    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Check for column 0 block headers
    if (!rawLine.startsWith(' ') && !rawLine.startsWith('\t')) {
      flushScalar();
      flushRule();
      flushPitfall();

      const docMatch = rawLine.match(/^@doc\s+(\S+)\s+(\S+)/);
      if (docMatch) {
        currentBlock = 'DOC';
        docHeader = {
          kind: docMatch[1],
          slug: docMatch[2],
          sources: [],
          keywords: [],
        };
        continue;
      }

      const ruleBlockMatch = rawLine.match(/^@rule\s+(\S+)/);
      if (ruleBlockMatch) {
        currentBlock = 'RULE';
        const ruleSlug = ruleBlockMatch[1].replace(/\//g, '-');
        currentRule = {
          statement: '',
          evidenceRaw: null,
          detail: null,
          anti: null,
          good: null,
          slug: ruleSlug,
        };
        continue;
      }

      if (/^@contract\b/.test(rawLine) || /^@dependency_rules\b/.test(rawLine)) {
        currentBlock = 'CONTRACT';
        continue;
      }

      if (/^@pitfalls\b/.test(rawLine)) {
        currentBlock = 'PITFALLS';
        continue;
      }

      // Check exclamation pitfall header: ! [severity/type] id: statement
      const exclPitfall = rawLine.match(/^!\s*\[([^/]+)\/([^\]]+)\]\s*([^:]+):\s*(.*)$/);
      if (exclPitfall) {
        currentBlock = 'PITFALLS';
        currentPitfall = {
          severity: exclPitfall[1].trim(),
          type: exclPitfall[2].trim(),
          id: exclPitfall[3].trim(),
          statement: unquote(exclPitfall[4].trim()),
          trigger: null,
          evidenceRaw: null,
          detail: null,
        };
        continue;
      }

      if (rawLine.startsWith('@')) {
        currentBlock = 'OTHER';
        continue;
      }
    }

    // Block-specific field handling
    if (currentBlock === 'DOC' && docHeader) {
      const repoMatch = trimmed.match(/^repo:\s*(.+)$/);
      if (repoMatch) {
        docHeader.repo = unquote(repoMatch[1]);
        continue;
      }
      const roleMatch = trimmed.match(/^role:\s*(.+)$/);
      if (roleMatch) {
        docHeader.role = unquote(roleMatch[1]);
        continue;
      }
      if (/^description\s*::/.test(trimmed)) {
        const indentMatch = rawLine.match(/^(\s*)/);
        multilineScalar = {
          target: 'DOC_DESC',
          indent: indentMatch ? indentMatch[1].length : 2,
          lines: [],
        };
        continue;
      }
      const descMatch = trimmed.match(/^(?:description|summary):\s*(.+)$/);
      if (descMatch) {
        docHeader.description = unquote(descMatch[1]);
        continue;
      }
      const sourcesMatch = trimmed.match(/^sources:\s*(.+)$/);
      if (sourcesMatch) {
        let srcStr = sourcesMatch[1];
        if (srcStr.startsWith('[') && !srcStr.endsWith(']')) {
          while (lineIndex + 1 < lines.length && !srcStr.includes(']')) {
            lineIndex++;
            srcStr += ' ' + lines[lineIndex].trim();
          }
        }
        docHeader.sources = parseArray(srcStr);
        continue;
      }
      const keywordsMatch = trimmed.match(/^keywords:\s*(.+)$/);
      if (keywordsMatch) {
        let kwStr = keywordsMatch[1];
        if (kwStr.startsWith('[') && !kwStr.endsWith(']')) {
          while (lineIndex + 1 < lines.length && !kwStr.includes(']')) {
            lineIndex++;
            kwStr += ' ' + lines[lineIndex].trim();
          }
        }
        docHeader.keywords = parseArray(kwStr);
        continue;
      }
    } else if (currentBlock === 'CONTRACT') {
      // Contract rule item: "- rule: ..."
      const ruleItemMatch = trimmed.match(/^-\s*rule:\s*(.+)$/);
      if (ruleItemMatch) {
        flushScalar();
        flushRule();
        currentRule = {
          statement: unquote(ruleItemMatch[1]),
          evidenceRaw: null,
          detail: null,
          anti: null,
          good: null,
        };
        continue;
      }

      if (currentRule) {
        const evMatch = trimmed.match(/^evidence:\s*(.+)$/);
        if (evMatch) {
          currentRule.evidenceRaw = unquote(evMatch[1]);
          continue;
        }
        if (/^detail\s*::/.test(trimmed)) {
          const indentMatch = rawLine.match(/^(\s*)/);
          multilineScalar = {
            target: 'RULE_DETAIL',
            indent: indentMatch ? indentMatch[1].length : 4,
            lines: [],
          };
          continue;
        }
        const detailMatch = trimmed.match(/^detail:\s*(.+)$/);
        if (detailMatch) {
          currentRule.detail = unquote(detailMatch[1]);
          continue;
        }
        const antiMatch = trimmed.match(/^anti:\s*(.+)$/);
        if (antiMatch) {
          currentRule.anti = unquote(antiMatch[1]);
          continue;
        }
        const goodMatch = trimmed.match(/^good:\s*(.+)$/);
        if (goodMatch) {
          currentRule.good = unquote(goodMatch[1]);
          continue;
        }
      }
    } else if (currentBlock === 'RULE' && currentRule) {
      const stmtMatch = trimmed.match(/^statement:\s*(.+)$/);
      if (stmtMatch) {
        currentRule.statement = unquote(stmtMatch[1]);
        continue;
      }
      const evMatch = trimmed.match(/^evidence:\s*(.+)$/);
      if (evMatch) {
        currentRule.evidenceRaw = unquote(evMatch[1]);
        continue;
      }
      if (/^detail\s*::/.test(trimmed)) {
        const indentMatch = rawLine.match(/^(\s*)/);
        multilineScalar = {
          target: 'RULE_DETAIL',
          indent: indentMatch ? indentMatch[1].length : 2,
          lines: [],
        };
        continue;
      }
      const cautionMatch = trimmed.match(/^(?:caution|detail):\s*(.+)$/);
      if (cautionMatch) {
        currentRule.detail = unquote(cautionMatch[1]);
        continue;
      }
      const antiMatch = trimmed.match(/^anti:\s*(.+)$/);
      if (antiMatch) {
        currentRule.anti = unquote(antiMatch[1]);
        continue;
      }
      const goodMatch = trimmed.match(/^good:\s*(.+)$/);
      if (goodMatch) {
        currentRule.good = unquote(goodMatch[1]);
        continue;
      }
    } else if (currentBlock === 'PITFALLS') {
      // Style A: "- id: <slug>-p<N>"
      const pitItemMatch = trimmed.match(/^-\s*id:\s*(.+)$/);
      if (pitItemMatch) {
        flushScalar();
        flushPitfall();
        currentPitfall = {
          id: unquote(pitItemMatch[1]),
          severity: 'medium',
          type: 'gotcha',
          statement: '',
          trigger: null,
          evidenceRaw: null,
          detail: null,
        };
        continue;
      }

      // Style B: ! [severity/type] id: statement
      const exclPitfall = trimmed.match(/^!?\s*\[([^/]+)\/([^\]]+)\]\s*([^:]+):\s*(.*)$/);
      if (exclPitfall) {
        flushScalar();
        flushPitfall();
        currentPitfall = {
          severity: exclPitfall[1].trim(),
          type: exclPitfall[2].trim(),
          id: exclPitfall[3].trim(),
          statement: unquote(exclPitfall[4].trim()),
          trigger: null,
          evidenceRaw: null,
          detail: null,
        };
        continue;
      }

      if (currentPitfall) {
        const sumMatch = trimmed.match(/^(?:summary|statement):\s*(.+)$/);
        if (sumMatch) {
          currentPitfall.statement = unquote(sumMatch[1]);
          continue;
        }
        const classMatch = trimmed.match(/^(?:class|type):\s*(.+)$/);
        if (classMatch) {
          currentPitfall.type = unquote(classMatch[1]);
          continue;
        }
        const sevMatch = trimmed.match(/^severity:\s*(.+)$/);
        if (sevMatch) {
          currentPitfall.severity = unquote(sevMatch[1]);
          continue;
        }
        const trigMatch = trimmed.match(/^trigger:\s*(.+)$/);
        if (trigMatch) {
          currentPitfall.trigger = unquote(trigMatch[1]);
          continue;
        }
        const evMatch = trimmed.match(/^evidence:\s*(.+)$/);
        if (evMatch) {
          currentPitfall.evidenceRaw = unquote(evMatch[1]);
          continue;
        }
        if (/^(?:consequence|detail)\s*::/.test(trimmed)) {
          const indentMatch = rawLine.match(/^(\s*)/);
          multilineScalar = {
            target: 'PITFALL_DETAIL',
            indent: indentMatch ? indentMatch[1].length : 4,
            lines: [],
          };
          continue;
        }
        const conMatch = trimmed.match(/^(?:consequence|detail):\s*(.+)$/);
        if (conMatch) {
          currentPitfall.detail = unquote(conMatch[1]);
          continue;
        }
      }
    }
  }

  flushScalar();
  flushRule();
  flushPitfall();

  let finalDoc: DocRecord | null = null;
  if (docHeader) {
    finalDoc = {
      id: computeDocId(),
      repo: docHeader.repo || 'unknown',
      kind: docHeader.kind,
      summary: docHeader.description || '',
      sources: docHeader.sources,
      keywords: docHeader.keywords,
    };
  }

  return {
    doc: finalDoc,
    rules,
    pitfalls,
  };
}

// --- CLI DISCOVERY & RUNNER ---

function findMarkdownFiles(dir: string): string[] {
  let results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findMarkdownFiles(full));
      } else if (entry.name.endsWith('.md')) {
        results.push(full);
      }
    }
  } catch {}
  return results;
}

function findProjectRoot(startPath?: string): string {
  let dir = startPath ? path.resolve(startPath) : process.cwd();
  if (fs.existsSync(dir) && !fs.statSync(dir).isDirectory()) {
    dir = path.dirname(dir);
  }
  while (dir && dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json')) || fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', (err) => reject(err));
  });
}

function printUsage() {
  console.log(`
Usage:
  extract-docs [options] [files...]

Arguments:
  files...                Markdown doc files or directories to parse.

Options:
  --project-root <path>   Root path of the target repository (default: auto-detected)
  --out-docs <file>       Output destination for docs JSONL (default: stdout)
  --out-rules <file>      Output destination for doc_rules JSONL (default: stdout)
  --out-pitfalls <file>   Output destination for doc_pitfalls JSONL (default: stdout)
  -h, --help              Display this help message
`);
}

export async function main() {
  const args = process.argv.slice(2);
  let projectRoot = '';
  let outDocsPath = '';
  let outRulesPath = '';
  let outPitfallsPath = '';
  const positionalArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--project-root') {
      projectRoot = args[++i];
    } else if (arg.startsWith('--project-root=')) {
      projectRoot = arg.slice('--project-root='.length);
    } else if (arg === '--out-docs') {
      outDocsPath = args[++i];
    } else if (arg.startsWith('--out-docs=')) {
      outDocsPath = arg.slice('--out-docs='.length);
    } else if (arg === '--out-rules') {
      outRulesPath = args[++i];
    } else if (arg.startsWith('--out-rules=')) {
      outRulesPath = arg.slice('--out-rules='.length);
    } else if (arg === '--out-pitfalls') {
      outPitfallsPath = args[++i];
    } else if (arg.startsWith('--out-pitfalls=')) {
      outPitfallsPath = arg.slice('--out-pitfalls='.length);
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (!arg.startsWith('--')) {
      positionalArgs.push(arg);
    }
  }

  let targetFiles: string[] = [];
  if (positionalArgs.length > 0 && !positionalArgs.includes('-')) {
    for (const p of positionalArgs) {
      const resolved = path.resolve(p);
      if (fs.existsSync(resolved)) {
        if (fs.statSync(resolved).isDirectory()) {
          targetFiles.push(...findMarkdownFiles(resolved));
        } else {
          targetFiles.push(resolved);
        }
      } else {
        console.error(`Warning: path not found: ${p}`);
      }
    }
  } else if (!process.stdin.isTTY || positionalArgs.includes('-')) {
    const stdinContent = await readStdin();
    const lines = stdinContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
    for (const l of lines) {
      const resolved = path.resolve(l);
      if (fs.existsSync(resolved)) {
        if (fs.statSync(resolved).isDirectory()) {
          targetFiles.push(...findMarkdownFiles(resolved));
        } else {
          targetFiles.push(resolved);
        }
      }
    }
  }

  // If no files were given or found from arguments, check projectRoot/docs
  if (targetFiles.length === 0) {
    if (!projectRoot) {
      projectRoot = findProjectRoot();
    }
    const defaultDocsDir = path.join(projectRoot, 'docs');
    if (fs.existsSync(defaultDocsDir)) {
      targetFiles = findMarkdownFiles(defaultDocsDir);
    }
  }

  if (targetFiles.length === 0) {
    printUsage();
    process.exit(1);
  }

  if (!projectRoot) {
    projectRoot = findProjectRoot(targetFiles[0]);
  }
  projectRoot = path.resolve(projectRoot);

  const allDocs: DocRecord[] = [];
  const allRules: DocRuleRecord[] = [];
  const allPitfalls: DocPitfallRecord[] = [];

  // Sort files for deterministic processing
  targetFiles.sort();

  for (const file of targetFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const { doc, rules, pitfalls } = parseDocMarkdown(content, file, projectRoot);
      if (doc) {
        allDocs.push(doc);
      }
      allRules.push(...rules);
      allPitfalls.push(...pitfalls);
    } catch (err: any) {
      console.error(`Error parsing ${file}:`, err.message);
    }
  }

  const docsJsonl = allDocs.map((d) => JSON.stringify(d)).join('\n');
  const rulesJsonl = allRules.map((r) => JSON.stringify(r)).join('\n');
  const pitfallsJsonl = allPitfalls.map((p) => JSON.stringify(p)).join('\n');

  // Handle outputs
  const hasSpecificOut = outDocsPath || outRulesPath || outPitfallsPath;

  if (outDocsPath && outDocsPath !== '-') {
    fs.mkdirSync(path.dirname(path.resolve(outDocsPath)), { recursive: true });
    fs.writeFileSync(outDocsPath, docsJsonl ? docsJsonl + '\n' : '', 'utf8');
  } else if (!hasSpecificOut || outDocsPath === '-') {
    if (docsJsonl) console.log(docsJsonl);
  }

  if (outRulesPath && outRulesPath !== '-') {
    fs.mkdirSync(path.dirname(path.resolve(outRulesPath)), { recursive: true });
    fs.writeFileSync(outRulesPath, rulesJsonl ? rulesJsonl + '\n' : '', 'utf8');
  } else if (!hasSpecificOut || outRulesPath === '-') {
    if (rulesJsonl) console.log(rulesJsonl);
  }

  if (outPitfallsPath && outPitfallsPath !== '-') {
    fs.mkdirSync(path.dirname(path.resolve(outPitfallsPath)), { recursive: true });
    fs.writeFileSync(outPitfallsPath, pitfallsJsonl ? pitfallsJsonl + '\n' : '', 'utf8');
  } else if (!hasSpecificOut || outPitfallsPath === '-') {
    if (pitfallsJsonl) console.log(pitfallsJsonl);
  }
}

// Run if executed as script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Fatal extraction error:', err);
    process.exit(1);
  });
}
