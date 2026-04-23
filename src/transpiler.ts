import ts from 'typescript';

export class NoDefaultExportError extends Error {
  // no-op
}

export namespace PluginTranspiler {
  export interface IOptions {
    compilerOptions: ts.CompilerOptions & { target: ts.ScriptTarget };
  }
}

function isUseStrict(node: ts.Node): boolean {
  return (
    ts.isExpressionStatement(node) &&
    ts.isStringLiteral(node.expression) &&
    node.expression.text === 'use strict'
  );
}

export class PluginTranspiler {
  private _options: PluginTranspiler.IOptions;
  readonly importFunctionName = 'require';

  constructor(options: PluginTranspiler.IOptions) {
    this._options = options;
    if (options.compilerOptions.module) {
      throw new Error(
        'The module setting is an implementation detail of transpiler.'
      );
    }
  }

  /**
   * Transpile an ES6 plugin into a function body of an async function,
   * returning the plugin that would be exported as default.
   */
  transpile(
    code: string,
    requireDefaultExport: boolean,
    fileName?: string
  ): string {
    const result = ts.transpileModule(code, {
      fileName,
      compilerOptions: {
        ...this._options.compilerOptions,
        module: ts.ModuleKind.CommonJS
      },
      transformers: {
        before: requireDefaultExport
          ? [this._requireDefaultExportTransformer()]
          : [],
        after: [
          this._awaitRequireTransformer(),
          this._exportWrapperTransformer()
        ]
      }
    });
    return result.outputText;
  }

  private _exportWrapperTransformer(): ts.TransformerFactory<ts.SourceFile> {
    // working on output of `createImportCallExpressionCommonJS` from TypeScript
    return context => {
      return source => {
        const transpiledStatements = [...source.statements];
        const pinnedStatements = [];
        if (isUseStrict(transpiledStatements[0])) {
          const first = transpiledStatements.shift();
          if (first) {
            pinnedStatements.push(first);
          }
        }
        return ts.factory.updateSourceFile(source, [
          ...pinnedStatements,
          ts.factory.createVariableStatement(
            undefined /* modifiers */,
            ts.factory.createVariableDeclarationList(
              [
                ts.factory.createVariableDeclaration(
                  ts.factory.createIdentifier('exports'),
                  undefined /* exclamationToken */,
                  undefined /* type */,
                  ts.factory.createObjectLiteralExpression()
                )
              ],
              ts.NodeFlags.Const
            )
          ),
          // original statements
          ...transpiledStatements,
          // return `exports`
          ts.factory.createReturnStatement(
            ts.factory.createIdentifier('exports')
          )
        ]);
      };
    };
  }

  private _awaitRequireTransformer(): ts.TransformerFactory<ts.SourceFile> {
    // working on output of `createImportCallExpressionCommonJS` from TypeScript
    return context => {
      const visit: ts.Visitor = node => {
        if (ts.isCallExpression(node)) {
          const expression = node.expression;
          if (ts.isIdentifier(expression) && expression.text === 'require') {
            return ts.factory.createAwaitExpression(node);
          }
        }
        return ts.visitEachChild(node, child => visit(child), context);
      };

      return source => ts.visitNode(source, visit) as ts.SourceFile;
    };
  }

  private _requireDefaultExportTransformer(): ts.TransformerFactory<ts.SourceFile> {
    return context => {
      let defaultExport: ts.Expression | null = null;

      const visit: ts.Visitor = node => {
        // default export
        if (ts.isExportAssignment(node)) {
          const hasDefaultClause = node
            .getChildren()
            .some(node => node.kind === ts.SyntaxKind.DefaultKeyword);
          if (hasDefaultClause) {
            defaultExport = node.expression;
          } else {
            console.warn(
              'Export assignment without default keyword not supported: ' +
                node.getText(),
              node
            );
          }
        }
        return ts.visitEachChild(node, child => visit(child), context);
      };

      return source => {
        const traveresed = ts.visitNode(source, visit) as ts.SourceFile;
        if (!defaultExport) {
          throw new NoDefaultExportError('Default export not found');
        }
        return traveresed;
      };
    };
  }
}
