import ts from 'typescript';

interface ITokenReference {
  packageName: string;
  tokenSymbol: string;
}

interface ISourceUpdateResult {
  source: string;
  changedLines: number[];
}

export interface IActivateAppContextResult {
  source: string;
  appVariableName: string;
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
  const existingImportLines = hasNamedValueImport(
    source,
    tokenReference.packageName,
    tokenReference.tokenSymbol
  );
  if (existingImportLines.length > 0) {
    return { source, changedLines: existingImportLines };
  }

  const groupedImportResult = insertIntoExistingPackageImport(
    source,
    tokenReference
  );
  if (groupedImportResult) {
    return groupedImportResult;
  }

  const statement = `import { ${tokenReference.tokenSymbol} } from '${tokenReference.packageName}';`;
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
  const activate = resolveActivateFunction(activateProperty, sourceFile);

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
  const existingDependencyLines = new Set<number>();
  for (const arrayLiteral of [requiresArray, optionalArray]) {
    if (!arrayLiteral) {
      continue;
    }
    for (const element of arrayLiteral.elements) {
      if (ts.isIdentifier(element) && element.text === tokenSymbol) {
        existingDependencyLines.add(
          lineNumberAt(source, element.getStart(sourceFile))
        );
      }
    }
  }
  if (existingDependencyLines.size > 0) {
    if (activate) {
      for (const parameter of activate.parameters) {
        if (!parameter.type) {
          continue;
        }
        const typeNode = parameter.type;
        if (
          ts.isTypeReferenceNode(typeNode) &&
          ((ts.isIdentifier(typeNode.typeName) &&
            typeNode.typeName.text === tokenSymbol) ||
            (ts.isQualifiedName(typeNode.typeName) &&
              typeNode.typeName.right.text === tokenSymbol))
        ) {
          existingDependencyLines.add(
            lineNumberAt(source, parameter.getStart(sourceFile))
          );
        }
      }
    }
    return {
      source,
      changedLines: [...existingDependencyLines].sort(
        (left, right) => left - right
      )
    };
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
          source.slice(element.getStart(sourceFile), element.end).trimEnd()
        );
        elementTexts.push(tokenSymbol);
        edits.push({
          start: targetArray.elements.pos,
          end: targetArray.end - 1,
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
      source.slice(parameter.getStart(sourceFile), parameter.end).trimEnd()
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
      const parameterListEnd = findParameterListClosingParen(source, activate);
      edits.push({
        start: activate.parameters.pos,
        end: parameterListEnd,
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

export function ensurePluginActivateAppContext(
  source: string
): IActivateAppContextResult {
  const existingAppParameterName = findPluginActivateAppParameterName(source);
  if (existingAppParameterName) {
    return { source, appVariableName: existingAppParameterName };
  }

  const sourceFile = ts.createSourceFile(
    'plugin-playground-activate-context.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const pluginObject = resolveDefaultPluginObject(sourceFile);
  if (!pluginObject) {
    return { source, appVariableName: 'app' };
  }
  const activateProperty = findObjectProperty(pluginObject, 'activate');
  if (!activateProperty) {
    return { source, appVariableName: 'app' };
  }
  const activate = resolveActivateFunction(activateProperty, sourceFile);
  if (!activate) {
    return { source, appVariableName: 'app' };
  }

  const importResult = insertImportStatement(source, {
    packageName: '@jupyterlab/application',
    tokenSymbol: 'JupyterFrontEnd'
  });
  let updatedSource = importResult.source;
  const updatedSourceFile = ts.createSourceFile(
    'plugin-playground-activate-context-updated.ts',
    updatedSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const updatedPluginObject = resolveDefaultPluginObject(updatedSourceFile);
  if (!updatedPluginObject) {
    return { source: updatedSource, appVariableName: 'app' };
  }
  const updatedActivateProperty = findObjectProperty(
    updatedPluginObject,
    'activate'
  );
  if (!updatedActivateProperty) {
    return { source: updatedSource, appVariableName: 'app' };
  }
  const updatedActivate = resolveActivateFunction(
    updatedActivateProperty,
    updatedSourceFile
  );
  if (!updatedActivate) {
    return { source: updatedSource, appVariableName: 'app' };
  }

  const firstParameter = updatedActivate.parameters[0];
  if (
    firstParameter &&
    ts.isIdentifier(firstParameter.name) &&
    !firstParameter.type
  ) {
    const appVariableName = firstParameter.name.text || 'app';
    const parameterResult = applyEditsWithChangedLines(updatedSource, [
      {
        start: firstParameter.getStart(updatedSourceFile),
        end: firstParameter.end,
        text: `${appVariableName}: JupyterFrontEnd`
      }
    ]);
    return { source: parameterResult.source, appVariableName };
  }

  const existingParameterNames = new Set<string>();
  for (const parameter of updatedActivate.parameters) {
    if (ts.isIdentifier(parameter.name)) {
      existingParameterNames.add(parameter.name.text);
    }
  }
  let appVariableName = 'app';
  let suffix = 2;
  while (existingParameterNames.has(appVariableName)) {
    appVariableName = `app${suffix}`;
    suffix += 1;
  }

  const insertAt =
    updatedActivate.parameters.length > 0
      ? updatedActivate.parameters[0].getStart(updatedSourceFile)
      : updatedActivate.parameters.pos;
  const prefix = updatedActivate.parameters.length > 0 ? ', ' : '';
  const parameterResult = applyEditsWithChangedLines(updatedSource, [
    {
      start: insertAt,
      end: insertAt,
      text: `${appVariableName}: JupyterFrontEnd${prefix}`
    }
  ]);
  updatedSource = parameterResult.source;
  return { source: updatedSource, appVariableName };
}

export function findPluginActivateAppParameterName(
  source: string
): string | null {
  const sourceFile = ts.createSourceFile(
    'plugin-playground-command-insertion.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const pluginObjects = resolveDefaultPluginObjects(sourceFile);
  for (const pluginObject of pluginObjects) {
    const activateProperty = findObjectProperty(pluginObject, 'activate');
    if (!activateProperty) {
      continue;
    }
    const activate = resolveActivateFunction(activateProperty, sourceFile);
    const appParameterName = activate
      ? jupyterFrontEndParameterName(activate, sourceFile)
      : null;
    if (appParameterName) {
      return appParameterName;
    }
  }
  return null;
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
  const pluginObjects = resolveDefaultPluginObjects(sourceFile);
  return pluginObjects.length > 0 ? pluginObjects[0] : null;
}

function resolveDefaultPluginObjects(
  sourceFile: ts.SourceFile
): ts.ObjectLiteralExpression[] {
  const exported = resolveDefaultExportExpression(sourceFile);
  if (!exported) {
    return [];
  }
  return resolvePluginObjectsFromExpression(
    sourceFile,
    exported,
    new Set<string>()
  );
}

function resolveDefaultExportExpression(
  sourceFile: ts.SourceFile
): ts.Expression | null {
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      return unwrapExpression(statement.expression);
    }
  }
  return null;
}

function resolvePluginObjectsFromExpression(
  sourceFile: ts.SourceFile,
  expression: ts.Expression,
  seenIdentifiers: Set<string>
): ts.ObjectLiteralExpression[] {
  const unwrapped = unwrapExpression(expression);
  if (ts.isObjectLiteralExpression(unwrapped)) {
    return [unwrapped];
  }
  if (ts.isArrayLiteralExpression(unwrapped)) {
    const pluginObjects: ts.ObjectLiteralExpression[] = [];
    for (const element of unwrapped.elements) {
      if (ts.isSpreadElement(element)) {
        continue;
      }
      const nestedObjects = resolvePluginObjectsFromExpression(
        sourceFile,
        element,
        seenIdentifiers
      );
      for (const pluginObject of nestedObjects) {
        pluginObjects.push(pluginObject);
      }
    }
    return pluginObjects;
  }
  if (ts.isIdentifier(unwrapped)) {
    return resolvePluginObjectsFromIdentifier(
      sourceFile,
      unwrapped.text,
      seenIdentifiers
    );
  }
  return [];
}

function resolvePluginObjectsFromIdentifier(
  sourceFile: ts.SourceFile,
  identifierName: string,
  seenIdentifiers: Set<string>
): ts.ObjectLiteralExpression[] {
  if (seenIdentifiers.has(identifierName)) {
    return [];
  }
  seenIdentifiers.add(identifierName);
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === identifierName &&
        declaration.initializer
      ) {
        return resolvePluginObjectsFromExpression(
          sourceFile,
          declaration.initializer,
          seenIdentifiers
        );
      }
    }
  }
  return [];
}

function resolveActivateFunction(
  activateProperty: ts.ObjectLiteralElementLike,
  sourceFile?: ts.SourceFile
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
  if (
    sourceFile &&
    ts.isPropertyAssignment(activateProperty) &&
    ts.isIdentifier(activateProperty.initializer)
  ) {
    const referencedFunction = resolveFunctionLikeByName(
      sourceFile,
      activateProperty.initializer.text
    );
    if (referencedFunction) {
      return referencedFunction;
    }
  }
  return null;
}

function resolveFunctionLikeByName(
  sourceFile: ts.SourceFile,
  functionName: string
): ts.FunctionLikeDeclarationBase | null {
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === functionName
    ) {
      return statement;
    }
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === functionName &&
        declaration.initializer &&
        (ts.isArrowFunction(declaration.initializer) ||
          ts.isFunctionExpression(declaration.initializer))
      ) {
        return declaration.initializer;
      }
    }
  }
  return null;
}

function jupyterFrontEndParameterName(
  activate: ts.FunctionLikeDeclarationBase,
  sourceFile: ts.SourceFile
): string | null {
  const firstParameter = activate.parameters[0];
  const firstUntypedIdentifierName =
    firstParameter &&
    ts.isIdentifier(firstParameter.name) &&
    !firstParameter.type
      ? firstParameter.name.text
      : null;
  for (const parameter of activate.parameters) {
    if (!ts.isIdentifier(parameter.name) || !parameter.type) {
      continue;
    }
    const typeText = parameter.type.getText(sourceFile);
    if (/\bJupyterFrontEnd\b/.test(typeText)) {
      return parameter.name.text;
    }
  }
  return firstUntypedIdentifierName;
}

function insertIntoExistingPackageImport(
  source: string,
  tokenReference: ITokenReference
): ISourceUpdateResult | null {
  const sourceFile = ts.createSourceFile(
    'plugin-playground-import-grouping.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const statement = `import { ${tokenReference.tokenSymbol} } from '${tokenReference.packageName}';`;
  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
  let lastMatchingImport: ts.ImportDeclaration | null = null;

  for (const candidate of sourceFile.statements) {
    if (!ts.isImportDeclaration(candidate)) {
      continue;
    }
    if (
      !ts.isStringLiteral(candidate.moduleSpecifier) ||
      candidate.moduleSpecifier.text !== tokenReference.packageName
    ) {
      continue;
    }

    lastMatchingImport = candidate;
    const importClause = candidate.importClause;
    if (!importClause || importClause.isTypeOnly) {
      continue;
    }

    const namedBindings = importClause.namedBindings;
    if (!namedBindings) {
      if (importClause.name) {
        return applyEditsWithChangedLines(source, [
          {
            start: importClause.name.end,
            end: importClause.name.end,
            text: `, { ${tokenReference.tokenSymbol} }`
          }
        ]);
      }
      continue;
    }

    if (ts.isNamespaceImport(namedBindings)) {
      continue;
    }

    if (namedBindings.elements.length === 0) {
      return applyEditsWithChangedLines(source, [
        {
          start: namedBindings.elements.pos,
          end: namedBindings.elements.pos,
          text: tokenReference.tokenSymbol
        }
      ]);
    }

    const insertionPosition = namedBindings.elements.end;
    const hasTrailingComma = Boolean(namedBindings.elements.hasTrailingComma);
    const namedBindingsText = source.slice(
      namedBindings.getStart(sourceFile),
      namedBindings.end
    );
    if (namedBindingsText.includes('\n')) {
      const firstElement = namedBindings.elements[0];
      const elementIndent = firstElement
        ? lineIndent(source, firstElement.getStart(sourceFile))
        : '  ';
      return applyEditsWithChangedLines(source, [
        {
          start: insertionPosition,
          end: insertionPosition,
          text: `${hasTrailingComma ? '' : ','}${lineEnding}${elementIndent}${
            tokenReference.tokenSymbol
          }`
        }
      ]);
    }

    return applyEditsWithChangedLines(source, [
      {
        start: insertionPosition,
        end: insertionPosition,
        text: `${hasTrailingComma ? ' ' : ', '}${tokenReference.tokenSymbol}`
      }
    ]);
  }

  if (!lastMatchingImport) {
    return null;
  }

  return applyEditsWithChangedLines(source, [
    {
      start: lastMatchingImport.end,
      end: lastMatchingImport.end,
      text: `${lineEnding}${statement}`
    }
  ]);
}

function hasNamedValueImport(
  source: string,
  packageName: string,
  localName: string
): number[] {
  const sourceFile = ts.createSourceFile(
    'plugin-playground-import-check.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const matchingLines = new Set<number>();
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
        matchingLines.add(lineNumberAt(source, statement.getStart(sourceFile)));
        break;
      }
    }
  }
  return [...matchingLines].sort((left, right) => left - right);
}

function findParameterListClosingParen(
  source: string,
  activate: ts.FunctionLikeDeclarationBase
): number {
  const searchEnd = ts.isArrowFunction(activate)
    ? activate.equalsGreaterThanToken.pos
    : activate.body?.pos ?? activate.end;
  const closeParen = source.indexOf(')', activate.parameters.end);
  if (closeParen === -1 || closeParen > searchEnd) {
    return activate.parameters.end;
  }
  return closeParen;
}
