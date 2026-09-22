/**
 * TypeScript AST Extractor
 * Extracts code symbols and call graph edges using the TypeScript Compiler API.
 * Emits intermediate JSONL conforming to plugins/ast-doc-graph/.contexture/modules/ast-doc-graph/spec.md.
 */

import { createRequire } from 'node:module';
import * as path from 'node:path';
import * as fs from 'node:fs';

// --- INTERFACES ---

interface SymbolRecord {
  id: string;
  name: string;
  qname: string;
  kind: 'function' | 'method' | 'class' | 'interface' | 'variable' | 'constant' | 'type_alias';
  file: string;
  line_start: number;
  line_end: number;
  signature: string | null;
  docstring: string | null;
}

interface EdgeRecord {
  source: string;
  target: string;
  kind: 'CALLS' | 'DEFINES' | 'REFERENCES' | 'IMPORTS';
}

// --- DYNAMIC TYPESCRIPT RESOLUTION ---

function resolveTypeScript(searchPaths: string[]): any {
  // 1. Try standard require
  try {
    const req = createRequire(import.meta.url);
    const ts = req('typescript');
    if (ts && ts.createSourceFile) return ts;
  } catch {}

  // 2. Try search paths and parent node_modules
  for (const item of searchPaths) {
    if (!item) continue;
    try {
      let resolved = path.resolve(item);
      let dir = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()
        ? resolved
        : path.dirname(resolved);

      while (dir && dir !== path.dirname(dir)) {
        const candidatePkg = path.join(dir, 'node_modules', 'typescript', 'package.json');
        if (fs.existsSync(candidatePkg)) {
          const req = createRequire(candidatePkg);
          const ts = req('typescript');
          if (ts && ts.createSourceFile) return ts;
        }
        const pkgJson = path.join(dir, 'package.json');
        if (fs.existsSync(pkgJson)) {
          try {
            const req = createRequire(pkgJson);
            const ts = req('typescript');
            if (ts && ts.createSourceFile) return ts;
          } catch {}
        }
        dir = path.dirname(dir);
      }
    } catch {}
  }

  throw new Error(
    'Unable to resolve TypeScript compiler API from search paths: ' + searchPaths.join(', ')
  );
}

// --- PATH AND ROOT RESOLUTION ---

function findProjectRoot(filePath: string): string {
  let dir = path.dirname(path.resolve(filePath));
  while (dir && dir !== path.dirname(dir)) {
    if (
      fs.existsSync(path.join(dir, 'package.json')) ||
      fs.existsSync(path.join(dir, '.git'))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function normalizeRelativePath(filePath: string, projectRoot: string): string {
  const rel = path.relative(projectRoot, path.resolve(filePath));
  return rel.split(path.sep).join('/');
}

// --- AST HELPERS ---

function extractDocstring(ts: any, sourceFile: any, node: any): string | null {
  const fullText = sourceFile.text;
  const commentRanges = ts.getLeadingCommentRanges(fullText, node.pos);
  if (!commentRanges || commentRanges.length === 0) return null;

  for (let i = commentRanges.length-1; i >= 0; i--) {
    const range = commentRanges[i];
    const comment = fullText.substring(range.pos, range.end);
    if (comment.startsWith('/**')) {
      const lines = comment
        .replace(/^\/\*\*|\*\/$/g, '')
        .split('\n')
        .map((l: string) => l.replace(/^\s*\*\s?/, '').trim())
        .filter((l: string) => l.length > 0);
      return lines.join(' ') || null;
    }
  }
  return null;
}

function extractFunctionSignature(ts: any, sourceFile: any, node: any): string | null {
  if (!node.parameters) return null;
  const params = node.parameters
    .map((p: any) => p.getText(sourceFile).replace(/\s+/g, ' ').trim())
    .join(', ');

  let returnType = '';
  if (node.type) {
    returnType = node.type.getText(sourceFile).replace(/\s+/g, ' ').trim();
  }

  if (returnType) {
    return `(${params}) => ${returnType}`;
  }
  return `(${params})`;
}

function isSimpleAccess(ts: any, node: any): boolean {
  if (ts.isIdentifier(node)) return true;
  if (node.kind === ts.SyntaxKind.ThisKeyword) return true;
  if (ts.isPropertyAccessExpression(node)) return isSimpleAccess(ts, node.expression);
  return false;
}

function getCallTarget(ts: any, expr: any, sourceFile: any): string | null {
  if (ts.isIdentifier(expr)) {
    return expr.text;
  }
  if (ts.isPropertyAccessExpression(expr)) {
    if (isSimpleAccess(ts, expr)) {
      return expr.getText(sourceFile).replace(/\s+/g, '');
    }
    return expr.name.text;
  }
  return null;
}

function extractCallsFromBody(ts: any, bodyNode: any, sourceFile: any): string[] {
  const calls: string[] = [];
  function visit(node: any) {
    if (ts.isCallExpression(node)) {
      const target = getCallTarget(ts, node.expression, sourceFile);
      if (target) {
        calls.push(target);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(bodyNode);
  return calls;
}

// --- FILE PARSER ---

function parseSourceFile(
  ts: any,
  filePath: string,
  projectRoot: string
): { symbols: SymbolRecord[]; edges: EdgeRecord[] } {
  const resolvedPath = path.resolve(filePath);
  const code = fs.readFileSync(resolvedPath, 'utf8');
  const relFile = normalizeRelativePath(resolvedPath, projectRoot);

  const sourceFile = ts.createSourceFile(
    relFile,
    code,
    ts.ScriptTarget.ES2022,
    true
  );

  const symbols: SymbolRecord[] = [];
  const edges: EdgeRecord[] = [];
  const edgeDedupe = new Set<string>();

  function addSymbol(sym: SymbolRecord) {
    symbols.push(sym);
    // Emit DEFINES edge from file to symbol
    const definesEdge: EdgeRecord = {
      source: relFile,
      target: sym.id,
      kind: 'DEFINES',
    };
    const dedupeKey = `${definesEdge.source}->${definesEdge.target}->${definesEdge.kind}`;
    if (!edgeDedupe.has(dedupeKey)) {
      edgeDedupe.add(dedupeKey);
      edges.push(definesEdge);
    }
  }

  function addCalls(callerSymbolId: string, calls: string[]) {
    for (const callTarget of calls) {
      const edge: EdgeRecord = {
        source: callerSymbolId,
        target: callTarget,
        kind: 'CALLS',
      };
      const dedupeKey = `${edge.source}->${edge.target}->${edge.kind}`;
      if (!edgeDedupe.has(dedupeKey)) {
        edgeDedupe.add(dedupeKey);
        edges.push(edge);
      }
    }
  }

  function getNodeLines(node: any): { line_start: number; line_end: number } {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    return {
      line_start: start.line + 1,
      line_end: end.line + 1,
    };
  }

  // Iterate strictly over top-level module statements
  for (const stmt of sourceFile.statements) {
    // 1. FunctionDeclaration
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      const name = stmt.name.text;
      const lines = getNodeLines(stmt);
      const symId = `sym:${relFile}:${name}`;
      addSymbol({
        id: symId,
        name,
        qname: name,
        kind: 'function',
        file: relFile,
        line_start: lines.line_start,
        line_end: lines.line_end,
        signature: extractFunctionSignature(ts, sourceFile, stmt),
        docstring: extractDocstring(ts, sourceFile, stmt),
      });
      if (stmt.body) {
        const calls = extractCallsFromBody(ts, stmt.body, sourceFile);
        addCalls(symId, calls);
      }
      continue;
    }

    // 2. ClassDeclaration
    if (ts.isClassDeclaration(stmt) && stmt.name) {
      const className = stmt.name.text;
      const classLines = getNodeLines(stmt);
      const classSymId = `sym:${relFile}:${className}`;
      addSymbol({
        id: classSymId,
        name: className,
        qname: className,
        kind: 'class',
        file: relFile,
        line_start: classLines.line_start,
        line_end: classLines.line_end,
        signature: null,
        docstring: extractDocstring(ts, sourceFile, stmt),
      });

      for (const member of stmt.members) {
        if (ts.isMethodDeclaration(member) && member.name) {
          const methodName = member.name.getText(sourceFile);
          const qname = `${className}.${methodName}`;
          const mLines = getNodeLines(member);
          const mSymId = `sym:${relFile}:${qname}`;
          addSymbol({
            id: mSymId,
            name: methodName,
            qname,
            kind: 'method',
            file: relFile,
            line_start: mLines.line_start,
            line_end: mLines.line_end,
            signature: extractFunctionSignature(ts, sourceFile, member),
            docstring: extractDocstring(ts, sourceFile, member),
          });
          if (member.body) {
            const calls = extractCallsFromBody(ts, member.body, sourceFile);
            addCalls(mSymId, calls);
          }
        } else if (ts.isPropertyDeclaration(member) && member.name) {
          const propName = member.name.getText(sourceFile);
          if (
            member.initializer &&
            (ts.isArrowFunction(member.initializer) ||
              ts.isFunctionExpression(member.initializer))
          ) {
            const qname = `${className}.${propName}`;
            const pLines = getNodeLines(member);
            const pSymId = `sym:${relFile}:${qname}`;
            addSymbol({
              id: pSymId,
              name: propName,
              qname,
              kind: 'method',
              file: relFile,
              line_start: pLines.line_start,
              line_end: pLines.line_end,
              signature: extractFunctionSignature(ts, sourceFile, member.initializer),
              docstring: extractDocstring(ts, sourceFile, member),
            });
            if (member.initializer.body) {
              const calls = extractCallsFromBody(ts, member.initializer.body, sourceFile);
              addCalls(pSymId, calls);
            }
          }
        } else if (ts.isConstructorDeclaration(member)) {
          if (member.body) {
            const calls = extractCallsFromBody(ts, member.body, sourceFile);
            addCalls(classSymId, calls);
          }
        }
      }
      continue;
    }

    // 3. InterfaceDeclaration
    if (ts.isInterfaceDeclaration(stmt)) {
      const name = stmt.name.text;
      const lines = getNodeLines(stmt);
      addSymbol({
        id: `sym:${relFile}:${name}`,
        name,
        qname: name,
        kind: 'interface',
        file: relFile,
        line_start: lines.line_start,
        line_end: lines.line_end,
        signature: null,
        docstring: extractDocstring(ts, sourceFile, stmt),
      });
      continue;
    }

    // 4. TypeAliasDeclaration
    if (ts.isTypeAliasDeclaration(stmt)) {
      const name = stmt.name.text;
      const lines = getNodeLines(stmt);
      const signature = stmt.type ? stmt.type.getText(sourceFile).replace(/\s+/g, ' ').trim() : null;
      addSymbol({
        id: `sym:${relFile}:${name}`,
        name,
        qname: name,
        kind: 'type_alias',
        file: relFile,
        line_start: lines.line_start,
        line_end: lines.line_end,
        signature,
        docstring: extractDocstring(ts, sourceFile, stmt),
      });
      continue;
    }

    // 5. EnumDeclaration
    if (ts.isEnumDeclaration(stmt)) {
      const name = stmt.name.text;
      const lines = getNodeLines(stmt);
      addSymbol({
        id: `sym:${relFile}:${name}`,
        name,
        qname: name,
        kind: 'constant',
        file: relFile,
        line_start: lines.line_start,
        line_end: lines.line_end,
        signature: null,
        docstring: extractDocstring(ts, sourceFile, stmt),
      });
      continue;
    }

    // 6. VariableStatement (top-level declarations)
    if (ts.isVariableStatement(stmt)) {
      const isConst = Boolean(stmt.declarationList.flags & ts.NodeFlags.Const);
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const varName = decl.name.text;
        const init = decl.initializer;

        // Case A: ArrowFunction or FunctionExpression
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          const lines = getNodeLines(decl);
          const symId = `sym:${relFile}:${varName}`;
          addSymbol({
            id: symId,
            name: varName,
            qname: varName,
            kind: 'function',
            file: relFile,
            line_start: lines.line_start,
            line_end: lines.line_end,
            signature: extractFunctionSignature(ts, sourceFile, init),
            docstring: extractDocstring(ts, sourceFile, stmt),
          });
          if (init.body) {
            const calls = extractCallsFromBody(ts, init.body, sourceFile);
            addCalls(symId, calls);
          }
        }
        // Case B: ObjectLiteralExpression (module-level namespace/service object)
        else if (init && ts.isObjectLiteralExpression(init)) {
          const objLines = getNodeLines(decl);
          const objSymId = `sym:${relFile}:${varName}`;
          addSymbol({
            id: objSymId,
            name: varName,
            qname: varName,
            kind: isConst ? 'constant' : 'variable',
            file: relFile,
            line_start: objLines.line_start,
            line_end: objLines.line_end,
            signature: null,
            docstring: extractDocstring(ts, sourceFile, stmt),
          });

          // Inspect direct properties of this top-level object
          for (const prop of init.properties) {
            if (ts.isPropertyAssignment(prop) && prop.name) {
              const propName = prop.name.getText(sourceFile);
              const pInit = prop.initializer;
              if (
                pInit &&
                (ts.isArrowFunction(pInit) || ts.isFunctionExpression(pInit))
              ) {
                const qname = `${varName}.${propName}`;
                const pLines = getNodeLines(prop);
                const pSymId = `sym:${relFile}:${qname}`;
                addSymbol({
                  id: pSymId,
                  name: propName,
                  qname,
                  kind: 'method',
                  file: relFile,
                  line_start: pLines.line_start,
                  line_end: pLines.line_end,
                  signature: extractFunctionSignature(ts, sourceFile, pInit),
                  docstring: extractDocstring(ts, sourceFile, prop),
                });
                if (pInit.body) {
                  const calls = extractCallsFromBody(ts, pInit.body, sourceFile);
                  addCalls(pSymId, calls);
                }
              }
            } else if (ts.isMethodDeclaration(prop) && prop.name) {
              const propName = prop.name.getText(sourceFile);
              const qname = `${varName}.${propName}`;
              const pLines = getNodeLines(prop);
              const pSymId = `sym:${relFile}:${qname}`;
              addSymbol({
                id: pSymId,
                name: propName,
                qname,
                kind: 'method',
                file: relFile,
                line_start: pLines.line_start,
                line_end: pLines.line_end,
                signature: extractFunctionSignature(ts, sourceFile, prop),
                docstring: extractDocstring(ts, sourceFile, prop),
              });
              if (prop.body) {
                const calls = extractCallsFromBody(ts, prop.body, sourceFile);
                addCalls(pSymId, calls);
              }
            }
          }
        }
        // Case C: Standard constant or variable
        else {
          const lines = getNodeLines(decl);
          const typeSig = decl.type
            ? decl.type.getText(sourceFile).replace(/\s+/g, ' ').trim()
            : null;
          addSymbol({
            id: `sym:${relFile}:${varName}`,
            name: varName,
            qname: varName,
            kind: isConst ? 'constant' : 'variable',
            file: relFile,
            line_start: lines.line_start,
            line_end: lines.line_end,
            signature: typeSig,
            docstring: extractDocstring(ts, sourceFile, stmt),
          });
        }
      }
    }
  }

  return { symbols, edges };
}

// --- CLI RUNNER ---

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function printUsage() {
  console.log(`Usage: extract-ts [options] <files...>

Options:
  --project-root <path>   Root path of the target repository (default: auto-detected)
  --out-symbols <file>    Output destination for symbols JSONL (default: stdout)
  --out-edges <file>      Output destination for edges JSONL (default: stdout)
  -h, --help              Display this help message
`);
}

async function main() {
  const args = process.argv.slice(2);
  let projectRoot = '';
  let outSymbolsPath = '';
  let outEdgesPath = '';
  const positionalFiles: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--project-root') {
      projectRoot = args[++i];
    } else if (arg.startsWith('--project-root=')) {
      projectRoot = arg.slice('--project-root='.length);
    } else if (arg === '--out-symbols') {
      outSymbolsPath = args[++i];
    } else if (arg.startsWith('--out-symbols=')) {
      outSymbolsPath = arg.slice('--out-symbols='.length);
    } else if (arg === '--out-edges') {
      outEdgesPath = args[++i];
    } else if (arg.startsWith('--out-edges=')) {
      outEdgesPath = arg.slice('--out-edges='.length);
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (!arg.startsWith('--')) {
      positionalFiles.push(arg);
    }
  }

  let targetFiles: string[] = [];
  if (positionalFiles.length > 0 && !positionalFiles.includes('-')) {
    targetFiles = positionalFiles;
  } else if (!process.stdin.isTTY || positionalFiles.includes('-')) {
    const stdinContent = await readStdin();
    targetFiles = stdinContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
  }

  if (targetFiles.length === 0) {
    printUsage();
    process.exit(1);
  }

  // Determine project root if not supplied
  if (!projectRoot) {
    projectRoot = findProjectRoot(targetFiles[0]);
  }
  projectRoot = path.resolve(projectRoot);

  // Dynamically resolve TypeScript Compiler API
  const searchDirs = [
    projectRoot,
    ...targetFiles.map((f) => path.resolve(f)),
    process.cwd(),
  ];
  const ts = resolveTypeScript(searchDirs);

  const allSymbols: SymbolRecord[] = [];
  const allEdges: EdgeRecord[] = [];

  for (const file of targetFiles) {
    if (!fs.existsSync(file)) {
      console.error(`Warning: file not found: ${file}`);
      continue;
    }
    try {
      const { symbols, edges } = parseSourceFile(ts, file, projectRoot);
      allSymbols.push(...symbols);
      allEdges.push(...edges);
    } catch (err: any) {
      console.error(`Warning: error parsing ${file}: ${err.message}`);
    }
  }

  const symbolsJsonl = allSymbols.map((s) => JSON.stringify(s)).join('\n');
  const edgesJsonl = allEdges.map((e) => JSON.stringify(e)).join('\n');

  // Handle outputs
  if (outSymbolsPath && outSymbolsPath !== '-') {
    fs.mkdirSync(path.dirname(path.resolve(outSymbolsPath)), { recursive: true });
    fs.writeFileSync(outSymbolsPath, symbolsJsonl ? symbolsJsonl + '\n' : '', 'utf8');
  } else if (!outEdgesPath || outSymbolsPath === '-') {
    if (symbolsJsonl) {
      console.log(symbolsJsonl);
    }
  }

  if (outEdgesPath && outEdgesPath !== '-') {
    fs.mkdirSync(path.dirname(path.resolve(outEdgesPath)), { recursive: true });
    fs.writeFileSync(outEdgesPath, edgesJsonl ? edgesJsonl + '\n' : '', 'utf8');
  } else if (outEdgesPath === '-') {
    if (edgesJsonl) {
      console.log(edgesJsonl);
    }
  }
}

main().catch((err) => {
  console.error('Fatal extraction error:', err);
  process.exit(1);
});
