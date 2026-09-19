import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('keeps shared runtime imports limited to contracts, Zod and pure math', async () => {
  for (const [name, allowed] of [['contracts', ['zod']], ['motion', ['@trail/contracts', 'gl-matrix']]] as const) {
    const root = resolve('packages', name, 'src');
    const files = await readdir(root, { recursive: true });
    for (const file of files.filter(file => file.endsWith('.ts'))) {
      const source = await readFile(resolve(root, file), 'utf8');
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      function inspect(node: ts.Node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const specifier = node.moduleSpecifier.text;
          expect(specifier.startsWith('./') || specifier.startsWith('../') || allowed.some(value => value === specifier), `${name}/${file}: ${specifier}`).toBe(true);
        }
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          throw new Error(`Dynamic import in pure package: ${name}/${file}`);
        }
        if (ts.isIdentifier(node)) {
          expect(['window', 'document', 'navigator', 'process', 'setTimeout', 'setInterval', 'fetch', 'WebSocket'].includes(node.text), `${name}/${file}: ${node.text}`).toBe(false);
        }
        ts.forEachChild(node, inspect);
      }
      inspect(ast);
    }
  }
});
