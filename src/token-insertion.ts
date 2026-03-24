import ts from 'typescript';

interface ITokenReference {
  packageName: string;
  tokenSymbol: string;
}

interface ISourceUpdateResult {
  source: string;
  changedLines: number[];
}

const DEPENDENCY_MULTILINE_THRESHOLD = 3;
const PARAMETER_MULTILINE_THRESHOLD = 3;

export function parseTokenReference(tokenName: string): ITokenReference | null {
  const separatorIndex = tokenName.indexOf(':');
  if (separatorIndex === -1) {
    return null;
  }
  const packageName = tokenName.slice(0, separatorIndex).trim();
  const tokenSymbol = tokenName.slice(separatorIndex + 1).trim();
  if (!packageName || !tokenSymbol) {
    return null;
  }
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(tokenSymbol)) {
    return null;
  }
  return { packageName, tokenSymbol };
}

export function insertImportStatement(
  source: string,
  tokenReference: ITokenReference
): ISourceUpdateResult {
  const statement = `import { ${tokenReference.tokenSymbol} } from '${tokenReference.packageName}';`;
  if (
    hasNamedValueImport(
      source,
      tokenReference.packageName,
      tokenReference.tokenSymbol
    )
  ) {
    return { source, changedLines: [] };
  }

  const separator = source.length > 0 ? '\n' : '';
  return {
    source: `${statement}${separator}${source}`,
    changedLines: [0]
  };
}

export function insertTokenDependency(
  source: string,
  tokenSymbol: string
): ISourceUpdateResult {
  const sourceFile = ts.createSourceFile(
    'plugin-playground-token.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';

  const pluginObject = resolveDefaultPluginObject(sourceFile);
  if (!pluginObject) {
    return { source, changedLines: [] };
  }
  const activateProperty = findObjectProperty(pluginObject, 'activate');
  if (!activateProperty) {
    return { source, changedLines: [] };
  }

  const requiresProperty = findObjectProperty(pluginObject, 'requires');
  const optionalProperty = findObjectProperty(pluginObject, 'optional');
  const requiresArray = arrayPropertyInitializer(requiresProperty);
  const optionalArray = arrayPropertyInitializer(optionalProperty);
  if (requiresProperty && !requiresArray) {
    return { source, changedLines: [] };
  }
  if (!requiresProperty && optionalProperty && !optionalArray) {
    return { source, changedLines: [] };
  }
  if (
    arrayHasIdentifier(requiresArray, tokenSymbol) ||
    arrayHasIdentifier(optionalArray, tokenSymbol)
  ) {
    return { source, changedLines: [] };
  }

  const edits: Array<{ start: number; end: number; text: string }> = [];
  const dependencyKind: 'requires' | 'optional' =
    requiresArray || !optionalArray ? 'requires' : 'optional';
  const targetArray =
    dependencyKind === 'requires' ? requiresArray : optionalArray;
  if (targetArray) {
    if (targetArray.elements.length === 0) {
      edits.push({
        start: targetArray.elements.pos,
        end: targetArray.elements.pos,
        text: tokenSymbol
      });
    } else {
      const hasTrailingComma = Boolean(targetArray.elements.hasTrailingComma);
      const insertionPosition = targetArray.elements.end;
      const arrayText = source.slice(
        targetArray.getStart(sourceFile),
        targetArray.end
      );
      const shouldUseMultiline =
        arrayText.includes('\n') ||
        targetArray.elements.length + 1 >= DEPENDENCY_MULTILINE_THRESHOLD;
      if (shouldUseMultiline) {
        const propertyIndent = lineIndent(
          source,
          targetArray.getStart(sourceFile)
        );
        const multilineIndent = `${propertyIndent}  `;
        const elementTexts = targetArray.elements.map(element =>
          source.slice(element.getStart(sourceFile), element.end)
        );
        elementTexts.push(tokenSymbol);
        edits.push({
          start: targetArray.elements.pos,
          end: targetArray.elements.end,
          text: `${lineEnding}${multilineIndent}${elementTexts.join(
            `,${lineEnding}${multilineIndent}`
          )}${lineEnding}${propertyIndent}`
        });
      } else {
        edits.push({
          start: insertionPosition,
          end: insertionPosition,
          text: `${hasTrailingComma ? ' ' : ', '}${tokenSymbol}`
        });
      }
    }
  } else {
    const activateStart = activateProperty.getStart(sourceFile);
    const insertionStart =
      source.lastIndexOf('\n', Math.max(0, activateStart - 1)) + 1;
    const activateIndent = lineIndent(source, activateStart);
    edits.push({
      start: insertionStart,
      end: insertionStart,
      text: `${activateIndent}${dependencyKind}: [${tokenSymbol}],${lineEnding}`
    });
  }

  const activate = resolveActivateFunction(activateProperty);
  if (activate) {
    const requiredCount = requiresArray?.elements.length ?? 0;
    const optionalCount = optionalArray?.elements.length ?? 0;
    const desiredIndex =
      dependencyKind === 'requires'
        ? 1 + requiredCount
        : 1 + requiredCount + optionalCount;
    const existingNames = new Set<string>();
    for (const parameter of activate.parameters) {
      if (ts.isIdentifier(parameter.name)) {
        existingNames.add(parameter.name.text);
      }
    }
    const variableBase = /^I[A-Z]/.test(tokenSymbol)
      ? tokenSymbol.slice(1)
      : tokenSymbol;
    let parameterName = `${variableBase
      .charAt(0)
      .toLowerCase()}${variableBase.slice(1)}`;
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(parameterName)) {
      parameterName = 'service';
    }
    const baseName = parameterName;
    let suffix = 2;
    while (existingNames.has(parameterName)) {
      parameterName = `${baseName}${suffix}`;
      suffix += 1;
    }
    const parameterText = `${parameterName}: ${tokenSymbol}`;

    const insertionIndex = Math.max(
      0,
      Math.min(desiredIndex, activate.parameters.length)
    );
    const updatedParameters = activate.parameters.map(parameter =>
      source.slice(parameter.getStart(sourceFile), parameter.end)
    );
    updatedParameters.splice(insertionIndex, 0, parameterText);

    const currentParametersText = source.slice(
      activate.parameters.pos,
      activate.parameters.end
    );
    const shouldUseMultilineParameters =
      currentParametersText.includes('\n') ||
      updatedParameters.length >= PARAMETER_MULTILINE_THRESHOLD;
    if (shouldUseMultilineParameters) {
      const functionIndent = lineIndent(source, activate.getStart(sourceFile));
      const parameterIndent = `${functionIndent}  `;
      edits.push({
        start: activate.parameters.pos,
        end: activate.parameters.end,
        text: `${lineEnding}${parameterIndent}${updatedParameters.join(
          `,${lineEnding}${parameterIndent}`
        )}${lineEnding}${functionIndent}`
      });
    } else if (activate.parameters.length === 0) {
      edits.push({
        start: activate.parameters.pos,
        end: activate.parameters.pos,
        text: parameterText
      });
    } else if (insertionIndex < activate.parameters.length) {
      const insertionPoint =
        activate.parameters[insertionIndex].getStart(sourceFile);
      edits.push({
        start: insertionPoint,
        end: insertionPoint,
        text: `${parameterText}, `
      });
    } else {
      const lastParameter = activate.parameters[activate.parameters.length - 1];
      edits.push({
        start: lastParameter.end,
        end: lastParameter.end,
        text: `, ${parameterText}`
      });
    }
  }

  return applyEditsWithChangedLines(source, edits);
}

function applyEditsWithChangedLines(
  source: string,
  edits: Array<{ start: number; end: number; text: string }>
): ISourceUpdateResult {
  if (edits.length === 0) {
    return { source, changedLines: [] };
  }

  edits.sort((left, right) => left.start - right.start || left.end - right.end);
  const changedLines = new Set<number>();
  let updated = source;
  let offsetDelta = 0;
  for (const edit of edits) {
    const start = edit.start + offsetDelta;
    const end = edit.end + offsetDelta;
    const startLine = lineNumberAt(updated, start);
    const insertedNewlines = countNewlines(edit.text);
    changedLines.add(startLine);
    for (let index = 1; index <= insertedNewlines; index += 1) {
      changedLines.add(startLine + index);
    }

    updated = `${updated.slice(0, start)}${edit.text}${updated.slice(end)}`;
    offsetDelta += edit.text.length - (end - start);
  }
  return {
    source: updated,
    changedLines: [...changedLines].sort((left, right) => left - right)
  };
}

function lineNumberAt(source: string, offset: number): number {
  const limit = Math.max(0, Math.min(offset, source.length));
  let line = 0;
  for (let index = 0; index < limit; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
    }
  }
  return line;
}

function countNewlines(text: string): number {
  let count = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      count += 1;
    }
  }
  return count;
}

function lineIndent(source: string, offset: number): string {
  const start = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  const match = source.slice(start, offset).match(/^[ \t]*/);
  return match ? match[0] : '';
}

function findObjectProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string
): ts.ObjectLiteralElementLike | null {
  for (const property of objectLiteral.properties) {
    const name = property.name;
    if (
      name &&
      (ts.isIdentifier(name) ||
        ts.isStringLiteral(name) ||
        ts.isNumericLiteral(name)) &&
      name.text === propertyName
    ) {
      return property;
    }
  }
  return null;
}

function arrayPropertyInitializer(
  property: ts.ObjectLiteralElementLike | null
): ts.ArrayLiteralExpression | null {
  if (
    property &&
    ts.isPropertyAssignment(property) &&
    ts.isArrayLiteralExpression(property.initializer)
  ) {
    return property.initializer;
  }
  return null;
}

function arrayHasIdentifier(
  arrayLiteral: ts.ArrayLiteralExpression | null,
  identifier: string
): boolean {
  if (!arrayLiteral) {
    return false;
  }
  return arrayLiteral.elements.some(
    element => ts.isIdentifier(element) && element.text === identifier
  );
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (true) {
    if (ts.isParenthesizedExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isAsExpression(current) || ts.isTypeAssertionExpression(current)) {
      current = current.expression;
      continue;
    }
    return current;
  }
}

function resolveDefaultPluginObject(
  sourceFile: ts.SourceFile
): ts.ObjectLiteralExpression | null {
  let exported: ts.Expression | null = null;
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      exported = unwrapExpression(statement.expression);
      break;
    }
  }
  if (!exported) {
    return null;
  }
  if (ts.isObjectLiteralExpression(exported)) {
    return exported;
  }
  if (!ts.isIdentifier(exported)) {
    return null;
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === exported.text &&
        declaration.initializer &&
        ts.isObjectLiteralExpression(declaration.initializer)
      ) {
        return declaration.initializer;
      }
    }
  }
  return null;
}

function resolveActivateFunction(
  activateProperty: ts.ObjectLiteralElementLike
): ts.FunctionLikeDeclarationBase | null {
  if (ts.isMethodDeclaration(activateProperty)) {
    return activateProperty;
  }
  if (
    ts.isPropertyAssignment(activateProperty) &&
    (ts.isArrowFunction(activateProperty.initializer) ||
      ts.isFunctionExpression(activateProperty.initializer))
  ) {
    return activateProperty.initializer;
  }
  return null;
}

function hasNamedValueImport(
  source: string,
  packageName: string,
  localName: string
): boolean {
  const sourceFile = ts.createSourceFile(
    'plugin-playground-import-check.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }
    if (
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== packageName
    ) {
      continue;
    }

    const importClause = statement.importClause;
    if (!importClause || importClause.isTypeOnly) {
      continue;
    }
    const namedBindings = importClause.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) {
      continue;
    }

    for (const specifier of namedBindings.elements) {
      if (!specifier.isTypeOnly && specifier.name.text === localName) {
        return true;
      }
    }
  }
  return false;
}
