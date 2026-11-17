import typeScriptSource from '!!raw-loader!typescript/lib/typescript.js';
import typeScriptVfsGlobalsSource from '!!raw-loader!@typescript/vfs/dist/vfs.globals.js';

declare const require: {
  context(
    directory: string,
    useSubdirectories: boolean,
    regExp: RegExp
  ): {
    keys(): string[];
    (id: string): string | { default: string };
  };
};

export function createJavaScriptKernelVfsInitCode(): string {
  // Collect bundled TypeScript lib declaration files (lib*.d.ts) as raw text
  // so the kernel can create virtual file maps fully offline.
  const typeScriptLibContext = require.context(
    '!!raw-loader!typescript/lib',
    false,
    /^\.\/lib\..*\.d\.ts$/
  );
  const bundledTypeScriptLibFiles = Object.fromEntries(
    typeScriptLibContext.keys().flatMap((key): [string, string][] => {
      const moduleValue = typeScriptLibContext(key);
      const content =
        typeof moduleValue === 'string' ? moduleValue : moduleValue.default;
      if (typeof content !== 'string') {
        return [];
      }
      const fileName = key.replace(/^\.\//, '');
      return [[`/${fileName}`, content]];
    })
  ) as Record<string, string>;

  return `(() => {
  // Guard for a compatible TypeScript compiler API object.
  const hasUsableTypeScript = candidate => {
    return (
      !!candidate &&
      typeof candidate === "object" &&
      typeof candidate.createProgram === "function" &&
      typeof candidate.createSourceFile === "function" &&
      typeof candidate.ScriptTarget === "object"
    );
  };
  // Guard for a compatible @typescript/vfs API object.
  const hasUsableTypeScriptVfs = candidate => {
    return (
      !!candidate &&
      typeof candidate === "object" &&
      typeof candidate.createSystem === "function" &&
      typeof candidate.createVirtualTypeScriptEnvironment === "function"
    );
  };

  // Step 1: ensure globalThis.ts is present and usable.
  if (!hasUsableTypeScript(globalThis.ts)) {
    const tsSource = ${JSON.stringify(typeScriptSource)};
    (0, eval)(
      tsSource +
        '\\n;globalThis.ts = typeof ts !== "undefined" ? ts : globalThis.ts;'
    );
  }
  if (!hasUsableTypeScript(globalThis.ts)) {
    throw new Error(
      'Plugin Playground VFS bootstrap failed: bundled TypeScript did not initialize.'
    );
  }
  // Step 2: expose stable TypeScript aliases expected by kernel examples.
  if (!globalThis.typescript) {
    globalThis.typescript = globalThis.ts;
  }
  if (!globalThis.vfsBundledTs) {
    globalThis.vfsBundledTs = globalThis.ts;
  }
  // Step 3: publish bundled declaration libs and a helper map factory.
  if (!globalThis.vfsBundledLibFiles) {
    globalThis.vfsBundledLibFiles = ${JSON.stringify(
      bundledTypeScriptLibFiles
    )};
  }
  if (!globalThis.vfsCreateDefaultMapFromBundledLibs) {
    globalThis.vfsCreateDefaultMapFromBundledLibs = () => {
      return new Map(Object.entries(globalThis.vfsBundledLibFiles));
    };
  }
  // Step 4: ensure @typescript/vfs globals are loaded and compatible.
  if (!hasUsableTypeScriptVfs(globalThis.tsvfs)) {
    const source = ${JSON.stringify(typeScriptVfsGlobalsSource)};
    (0, eval)(source);
  }
  if (!hasUsableTypeScriptVfs(globalThis.tsvfs)) {
    throw new Error(
      'Plugin Playground VFS bootstrap failed: bundled @typescript/vfs did not initialize.'
    );
  }
  if (!hasUsableTypeScriptVfs(globalThis.vfs)) {
    globalThis.vfs = globalThis.tsvfs;
  }
  if (!hasUsableTypeScriptVfs(globalThis.vfs)) {
    throw new Error(
      'Plugin Playground VFS bootstrap failed: global vfs is not compatible with @typescript/vfs.'
    );
  }
  // Step 5: register a comm-based TypeScript LSP endpoint in the kernel.
  const ts = globalThis.vfsBundledTs;
  const vfsApi = globalThis.vfs;
  const createDefaultMap = globalThis.vfsCreateDefaultMapFromBundledLibs;
  const docStateByUri = new Map();
      const uriByPath = new Map();
      let environment = null;
      let environmentDirty = true;
      const languageToExtension = {
        javascript: ".js",
        javascriptreact: ".jsx",
        typescript: ".ts",
        typescriptreact: ".tsx"
      };

      const sanitizePath = value => {
        return String(value || "").replace(/[^A-Za-z0-9._/\\-]/g, "_");
      };

      const pathFromUri = uri => {
        try {
          const url = new URL(uri);
          if (url.protocol === "file:") {
            const path = decodeURIComponent(url.pathname || "");
            if (path) {
              return path.startsWith("/") ? path : "/" + path;
            }
          }
        } catch {
          // URL parsing failed; use deterministic path sanitization below.
        }
        const sanitized = sanitizePath(uri);
        return sanitized.startsWith("/") ? sanitized : "/" + sanitized;
      };

      const normalizeDocumentPath = value => {
        if (typeof value !== "string") {
          return "/index.ts";
        }
        const trimmed = value.trim();
        if (!trimmed) {
          return "/index.ts";
        }

        if (trimmed.startsWith("file://")) {
          return pathFromUri(trimmed);
        }

        if (trimmed.startsWith("file:")) {
          const remainder = trimmed.slice("file:".length).replace(/^\\/+/, "");
          return pathFromUri("file:///" + remainder);
        }

        if (trimmed.startsWith("/")) {
          return trimmed;
        }

        return "/" + trimmed.replace(/^\\/+/, "");
      };

      const locationUriForPath = (filePath, originUri, originPath) => {
        const normalizedPath = normalizeDocumentPath(filePath);
        if (originPath && normalizedPath === originPath && typeof originUri === "string") {
          return originUri;
        }
        const indexedUri = uriByPath.get(normalizedPath);
        if (typeof indexedUri === "string") {
          return indexedUri;
        }
        for (const [uri, state] of docStateByUri.entries()) {
          if (state && state.path === normalizedPath && typeof uri === "string") {
            uriByPath.set(normalizedPath, uri);
            return uri;
          }
        }
        return null;
      };

      const ensurePathForDocument = (uri, languageId) => {
        const basePath = normalizeDocumentPath(uri);
        const extension = languageToExtension[languageId || ""] || ".ts";
        if (/\\.[^./]+$/.test(basePath)) {
          return basePath;
        }
        return basePath + extension;
      };

      const textForUri = uri => {
        const state = docStateByUri.get(uri);
        return state ? state.text : "";
      };

      const lineStartsForText = text => {
        const starts = [0];
        for (let index = 0; index < text.length; index += 1) {
          if (text.charCodeAt(index) === 10) {
            starts.push(index + 1);
          }
        }
        return starts;
      };

      const positionFromOffset = (text, offset) => {
        const normalizedOffset = Math.max(0, Math.min(offset, text.length));
        const starts = lineStartsForText(text);
        let low = 0;
        let high = starts.length - 1;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          if (starts[mid] <= normalizedOffset) {
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }
        const line = Math.max(0, high);
        const character = normalizedOffset - starts[line];
        return { line, character };
      };

      const offsetFromPosition = (text, position) => {
        const line = Math.max(0, position.line);
        const character = Math.max(0, position.character);
        const starts = lineStartsForText(text);
        if (line >= starts.length) {
          return text.length;
        }
        const lineStart = starts[line];
        const lineEnd = line + 1 < starts.length ? starts[line + 1] - 1 : text.length;
        return Math.max(lineStart, Math.min(lineStart + character, lineEnd));
      };

      const applyLspContentChange = (currentText, change) => {
        const range = change.range;
        if (!range) {
          return change.text;
        }

        const startOffset = offsetFromPosition(currentText, range.start);
        const endOffset = offsetFromPosition(currentText, range.end);
        const normalizedStart = Math.max(0, Math.min(startOffset, endOffset));
        const normalizedEnd = Math.max(0, Math.max(startOffset, endOffset));

        return (
          currentText.slice(0, normalizedStart) +
          change.text +
          currentText.slice(normalizedEnd)
        );
      };

      const applyLspContentChanges = (currentText, contentChanges) => {
        if (contentChanges.length === 0) {
          return currentText;
        }
        let nextText = currentText;
        for (const change of contentChanges) {
          nextText = applyLspContentChange(nextText, change);
        }
        return nextText;
      };

      const completionKindFromTypeScriptKind = kind => {
        if (kind === ts.ScriptElementKind.keyword) {
          return 14;
        }
        if (
          kind === ts.ScriptElementKind.functionElement ||
          kind === ts.ScriptElementKind.localFunctionElement
        ) {
          return 3;
        }
        if (kind === ts.ScriptElementKind.memberFunctionElement) {
          return 2;
        }
        if (
          kind === ts.ScriptElementKind.variableElement ||
          kind === ts.ScriptElementKind.localVariableElement ||
          kind === ts.ScriptElementKind.parameterElement ||
          kind === ts.ScriptElementKind.letElement
        ) {
          return 6;
        }
        if (kind === ts.ScriptElementKind.constElement) {
          return 21;
        }
        if (
          kind === ts.ScriptElementKind.memberVariableElement ||
          kind === ts.ScriptElementKind.memberGetAccessorElement ||
          kind === ts.ScriptElementKind.memberSetAccessorElement
        ) {
          return 10;
        }
        if (
          kind === ts.ScriptElementKind.classElement ||
          kind === ts.ScriptElementKind.localClassElement
        ) {
          return 7;
        }
        if (kind === ts.ScriptElementKind.interfaceElement) {
          return 8;
        }
        if (kind === ts.ScriptElementKind.typeElement) {
          return 25;
        }
        if (kind === ts.ScriptElementKind.enumElement) {
          return 13;
        }
        if (kind === ts.ScriptElementKind.enumMemberElement) {
          return 20;
        }
        if (kind === ts.ScriptElementKind.moduleElement) {
          return 9;
        }
        return 1;
      };

      const documentHighlightKindFromTypeScriptKind = kind => {
        const highlightSpanKind = ts.HighlightSpanKind || {};
        if (kind === highlightSpanKind.writtenReference) {
          return 3;
        }
        if (
          kind === highlightSpanKind.reference ||
          kind === highlightSpanKind.definition
        ) {
          return 2;
        }
        return 1;
      };

      const documentSymbolKindFromTypeScriptKind = kind => {
        if (
          kind === ts.ScriptElementKind.moduleElement ||
          kind === ts.ScriptElementKind.externalModuleName
        ) {
          return 2;
        }
        if (
          kind === ts.ScriptElementKind.classElement ||
          kind === ts.ScriptElementKind.localClassElement
        ) {
          return 5;
        }
        if (kind === ts.ScriptElementKind.interfaceElement) {
          return 11;
        }
        if (
          kind === ts.ScriptElementKind.functionElement ||
          kind === ts.ScriptElementKind.localFunctionElement
        ) {
          return 12;
        }
        if (
          kind === ts.ScriptElementKind.memberFunctionElement ||
          kind === ts.ScriptElementKind.constructSignatureElement ||
          kind === ts.ScriptElementKind.callSignatureElement
        ) {
          return 6;
        }
        if (kind === ts.ScriptElementKind.enumElement) {
          return 10;
        }
        if (kind === ts.ScriptElementKind.enumMemberElement) {
          return 22;
        }
        if (
          kind === ts.ScriptElementKind.memberVariableElement ||
          kind === ts.ScriptElementKind.memberGetAccessorElement ||
          kind === ts.ScriptElementKind.memberSetAccessorElement
        ) {
          return 7;
        }
        if (
          kind === ts.ScriptElementKind.variableElement ||
          kind === ts.ScriptElementKind.localVariableElement ||
          kind === ts.ScriptElementKind.letElement
        ) {
          return 13;
        }
        if (kind === ts.ScriptElementKind.constElement) {
          return 14;
        }
        if (kind === ts.ScriptElementKind.parameterElement) {
          return 26;
        }
        if (kind === ts.ScriptElementKind.typeElement) {
          return 13;
        }
        return 13;
      };

      const ensureEnvironment = () => {
        if (!environmentDirty && environment) {
          return environment;
        }

        const fsMap = createDefaultMap();
        const filePaths = [];
        for (const state of docStateByUri.values()) {
          fsMap.set(state.path, state.text);
          filePaths.push(state.path);
        }
        if (filePaths.length === 0) {
          fsMap.set("/index.ts", "");
          filePaths.push("/index.ts");
        }

        const moduleResolutionKind = ts.ModuleResolutionKind.NodeNext;
        const moduleKind = ts.ModuleKind.NodeNext;

        environment = vfsApi.createVirtualTypeScriptEnvironment(
          vfsApi.createSystem(fsMap),
          filePaths,
          ts,
          {
            allowJs: true,
            checkJs: true,
            target: ts.ScriptTarget.ES2022,
            module: moduleKind,
            moduleResolution: moduleResolutionKind,
            jsx: ts.JsxEmit.Preserve
          }
        );
        environmentDirty = false;
        return environment;
      };

      const textForPath = path => {
        const env = ensureEnvironment();
        const sourceFile = env.languageService.getProgram()?.getSourceFile(path);
        return sourceFile ? sourceFile.text : "";
      };

      const rangeForSpan = (uri, spanStart, spanLength, path) => {
        const text = path ? textForPath(path) || textForUri(uri) : textForUri(uri);
        const start = positionFromOffset(text, spanStart);
        const end = positionFromOffset(text, spanStart + Math.max(1, spanLength));
        return { start, end };
      };

      const diagnosticsForUri = uri => {
        const state = docStateByUri.get(uri);
        if (!state) {
          return [];
        }
        const env = ensureEnvironment();
        const languageService = env.languageService;
        const combinedDiagnostics = [
          ...languageService.getSyntacticDiagnostics(state.path),
          ...languageService.getSemanticDiagnostics(state.path)
        ];
        return combinedDiagnostics.map(diagnostic => {
          const spanStart = typeof diagnostic.start === "number" ? diagnostic.start : 0;
          const spanLength = typeof diagnostic.length === "number" ? diagnostic.length : 1;
          return {
            range: rangeForSpan(uri, spanStart, spanLength),
            severity: diagnostic.category === ts.DiagnosticCategory.Warning ? 2 : 1,
            source: "typescript",
            message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\\n")
          };
        });
      };

      const sendMessage = (comm, message) => {
        comm.send({ payload: JSON.stringify(message) });
      };

      const sendResponse = (comm, id, result) => {
        sendMessage(comm, { jsonrpc: "2.0", id, result });
      };

      const sendErrorResponse = (comm, id, code, message) => {
        sendMessage(comm, {
          jsonrpc: "2.0",
          id: id === undefined ? null : id,
          error: { code, message }
        });
      };

      const publishDiagnostics = (comm, uri) => {
        const diagnostics = diagnosticsForUri(uri);
        sendMessage(comm, {
          jsonrpc: "2.0",
          method: "textDocument/publishDiagnostics",
          params: {
            uri,
            diagnostics
          }
        });
      };

      const updateDocumentFromNotification = params => {
        const uri = params.textDocument.uri;
        const languageId = params.textDocument.languageId || "typescript";
        const currentState = docStateByUri.get(uri);
        const path = currentState
          ? currentState.path
          : ensurePathForDocument(uri, languageId);
        let text = currentState ? currentState.text : "";
        if ("text" in params.textDocument) {
          text = params.textDocument.text;
        } else if (params.contentChanges) {
          text = applyLspContentChanges(text, params.contentChanges);
        }
        if (
          currentState &&
          currentState.path !== path &&
          uriByPath.get(currentState.path) === uri
        ) {
          uriByPath.delete(currentState.path);
        }
        const didChangePath = !currentState || currentState.path !== path;
        const didChangeText = !currentState || currentState.text !== text;
        docStateByUri.set(uri, {
          path,
          text
        });
        uriByPath.set(path, uri);
        if (didChangePath || didChangeText) {
          environmentDirty = true;
        }
        return uri;
      };

      const uriFromParams = params => {
        return params.textDocument.uri;
      };

      const stateFromParams = params => {
        const uri = uriFromParams(params);
        if (!uri) {
          return null;
        }
        const state = docStateByUri.get(uri);
        if (!state) {
          return null;
        }
        return {
          uri,
          state
        };
      };

      const handleCompletionRequest = params => {
        const requestState = stateFromParams(params);
        if (!requestState) {
          return { isIncomplete: false, items: [] };
        }
        const position = params.position;
        const state = requestState.state;
        const env = ensureEnvironment();
        const offset = offsetFromPosition(state.text, position);
        const completionInfo = env.languageService.getCompletionsAtPosition(
          state.path,
          offset,
          {}
        );
        if (!completionInfo) {
          return { isIncomplete: false, items: [] };
        }
        return {
          isIncomplete: false,
          items: completionInfo.entries.map(entry => {
            return {
              label: entry.name,
              kind: completionKindFromTypeScriptKind(entry.kind),
              sortText: entry.sortText,
              detail: entry.kind,
              insertText: entry.insertText || entry.name
            };
          })
        };
      };

      const handleHoverRequest = params => {
        const requestState = stateFromParams(params);
        if (!requestState) {
          return null;
        }
        const position = params.position;
        const uri = requestState.uri;
        const state = requestState.state;
        const env = ensureEnvironment();
        const offset = offsetFromPosition(state.text, position);
        const quickInfo = env.languageService.getQuickInfoAtPosition(state.path, offset);
        if (!quickInfo) {
          return null;
        }
        const signature = ts.displayPartsToString(quickInfo.displayParts || []);
        const documentation = ts.displayPartsToString(quickInfo.documentation || []);
        const value = documentation ? signature + "\\n\\n" + documentation : signature;
        return {
          contents: { kind: "plaintext", value },
          range: rangeForSpan(uri, quickInfo.textSpan.start, quickInfo.textSpan.length)
        };
      };

      const asPlaintextDocumentation = documentation => {
        if (!documentation) {
          return "";
        }
        const text = ts.displayPartsToString(documentation);
        return typeof text === "string" ? text : "";
      };

      const signatureHelpTriggerReasonFromLspContext = context => {
        const triggerKind =
          context && typeof context.triggerKind === "number"
            ? context.triggerKind
            : 1;
        const triggerCharacter =
          context && typeof context.triggerCharacter === "string"
            ? context.triggerCharacter
            : undefined;

        const typedTriggerCharacters = new Set(["(", ",", "<"]);
        const retriggerCharacters = new Set(["(", ",", "<", ")"]);

        if (triggerKind === 2) {
          if (
            triggerCharacter &&
            typedTriggerCharacters.has(triggerCharacter)
          ) {
            return {
              kind: "characterTyped",
              triggerCharacter
            };
          }
          return {
            kind: "invoked"
          };
        }

        if (triggerKind === 3) {
          if (triggerCharacter && retriggerCharacters.has(triggerCharacter)) {
            return {
              kind: "retrigger",
              triggerCharacter
            };
          }
          return {
            kind: "retrigger"
          };
        }

        return {
          kind: "invoked"
        };
      };

      const handleSignatureHelpRequest = params => {
        const requestState = stateFromParams(params);
        if (!requestState) {
          return null;
        }
        const position = params.position;
        const state = requestState.state;

        const env = ensureEnvironment();
        const offset = offsetFromPosition(state.text, position);
        const signatureItems = env.languageService.getSignatureHelpItems(
          state.path,
          offset,
          {
            triggerReason: signatureHelpTriggerReasonFromLspContext(
              params.context
            )
          }
        );
        if (!signatureItems || !Array.isArray(signatureItems.items)) {
          return null;
        }
        if (signatureItems.items.length === 0) {
          return null;
        }

        const signatures = signatureItems.items.map(item => {
          const prefix = ts.displayPartsToString(item.prefixDisplayParts || []);
          const separator = ts.displayPartsToString(item.separatorDisplayParts || []);
          const suffix = ts.displayPartsToString(item.suffixDisplayParts || []);
          const parameters = (item.parameters || []).map(parameter => {
            const label = ts.displayPartsToString(parameter.displayParts || []);
            const documentation = asPlaintextDocumentation(parameter.documentation);
            return documentation
              ? { label, documentation }
              : { label };
          });
          const label =
            prefix +
            parameters
              .map(parameter => {
                return parameter.label;
              })
              .join(separator) +
            suffix;
          const documentation = asPlaintextDocumentation(item.documentation);

          return documentation
            ? {
                label,
                documentation,
                parameters
              }
            : {
                label,
                parameters
              };
        });

        const selectedItemIndex = Math.max(
          0,
          Math.min(signatureItems.selectedItemIndex || 0, signatures.length - 1)
        );
        const selectedSignature = signatureItems.items[selectedItemIndex];
        const selectedSignatureParameterCount =
          selectedSignature && Array.isArray(selectedSignature.parameters)
            ? selectedSignature.parameters.length
            : 0;
        const activeParameter = selectedSignatureParameterCount > 0
          ? Math.max(
              0,
              Math.min(
                signatureItems.argumentIndex || 0,
                selectedSignatureParameterCount - 1
              )
            )
          : 0;

        return {
          signatures,
          activeSignature: selectedItemIndex,
          activeParameter
        };
      };

      const locationsFromEntries = (entries, originUri, originPath) => {
        return entries.flatMap(entry => {
          const path = normalizeDocumentPath(entry.fileName);
          const uri = locationUriForPath(path, originUri, originPath);
          if (typeof uri !== "string" || uri.length === 0) {
            return [];
          }
          return {
            uri,
            range: rangeForSpan(uri, entry.textSpan.start, entry.textSpan.length, path)
          };
        });
      };

      const handleDefinitionRequest = params => {
        const requestState = stateFromParams(params);
        if (!requestState) {
          return [];
        }
        const position = params.position;
        const uri = requestState.uri;
        const state = requestState.state;
        const env = ensureEnvironment();
        const offset = offsetFromPosition(state.text, position);
        const definitions =
          env.languageService.getDefinitionAtPosition(state.path, offset) || [];
        return locationsFromEntries(definitions, uri, state.path);
      };

      const handleTypeDefinitionRequest = params => {
        const requestState = stateFromParams(params);
        if (!requestState) {
          return [];
        }
        const position = params.position;
        const uri = requestState.uri;
        const state = requestState.state;
        const env = ensureEnvironment();
        const offset = offsetFromPosition(state.text, position);
        const definitions =
          env.languageService.getTypeDefinitionAtPosition(state.path, offset) || [];
        return locationsFromEntries(definitions, uri, state.path);
      };

      const handleImplementationRequest = params => {
        const requestState = stateFromParams(params);
        if (!requestState) {
          return [];
        }
        const position = params.position;
        const uri = requestState.uri;
        const state = requestState.state;
        const env = ensureEnvironment();
        const offset = offsetFromPosition(state.text, position);
        const implementations =
          env.languageService.getImplementationAtPosition(state.path, offset) || [];
        return locationsFromEntries(implementations, uri, state.path);
      };

      const handleReferencesRequest = params => {
        const requestState = stateFromParams(params);
        if (!requestState) {
          return [];
        }
        const position = params.position;
        const uri = requestState.uri;
        const state = requestState.state;
        const env = ensureEnvironment();
        const offset = offsetFromPosition(state.text, position);
        const includeDeclaration =
          !params ||
          !params.context ||
          params.context.includeDeclaration !== false;
        const references =
          env.languageService.getReferencesAtPosition(state.path, offset) || [];
        const filteredReferences = includeDeclaration
          ? references
          : references.filter(reference => {
              return !reference.isDefinition;
            });
        return locationsFromEntries(filteredReferences, uri, state.path);
      };

      const handleDocumentHighlightRequest = params => {
        const requestState = stateFromParams(params);
        if (!requestState) {
          return [];
        }
        const position = params.position;
        const uri = requestState.uri;
        const state = requestState.state;
        const env = ensureEnvironment();
        const offset = offsetFromPosition(state.text, position);
        const documentHighlights =
          env.languageService.getDocumentHighlights(state.path, offset, [
            state.path
          ]) || [];
        return documentHighlights.flatMap(highlights => {
          const path = normalizeDocumentPath(highlights.fileName);
          const highlightUri = locationUriForPath(path, uri, state.path);
          if (!highlightUri) {
            return [];
          }
          return (highlights.highlightSpans || []).map(highlight => {
            return {
              range: rangeForSpan(
                highlightUri,
                highlight.textSpan.start,
                highlight.textSpan.length,
                path
              ),
              kind: documentHighlightKindFromTypeScriptKind(highlight.kind)
            };
          });
        });
      };

      const handleDocumentSymbolRequest = params => {
        const requestState = stateFromParams(params);
        if (!requestState) {
          return [];
        }
        const uri = requestState.uri;
        const state = requestState.state;
        const env = ensureEnvironment();
        const tree = env.languageService.getNavigationTree(state.path);
        if (!tree) {
          return [];
        }

        const symbols = [];
        const visitItems = (items, containerName) => {
          if (!Array.isArray(items)) {
            return;
          }
          for (const item of items) {
            if (!item || typeof item !== "object") {
              continue;
            }
            const name = typeof item.text === "string" ? item.text : "";
            const isScriptRoot = item.kind === ts.ScriptElementKind.scriptElement;
            const span =
              item.spans && Array.isArray(item.spans) && item.spans.length > 0
                ? item.spans[0]
                : item.textSpan;
            if (!isScriptRoot && name && span) {
              symbols.push({
                name,
                kind: documentSymbolKindFromTypeScriptKind(item.kind),
                location: {
                  uri,
                  range: rangeForSpan(uri, span.start, span.length, state.path)
                },
                containerName: containerName || undefined
              });
            }
            visitItems(item.childItems, isScriptRoot ? containerName : name);
          }
        };

        visitItems(tree.childItems, "");
        return symbols;
      };

      const handlePrepareRenameRequest = params => {
        const requestState = stateFromParams(params);
        if (!requestState) {
          return null;
        }
        const position = params.position;
        const uri = requestState.uri;
        const state = requestState.state;
        const env = ensureEnvironment();
        const offset = offsetFromPosition(state.text, position);
        const renameInfo = env.languageService.getRenameInfo(state.path, offset, {
          allowRenameOfImportPath: false
        });
        if (!renameInfo || !renameInfo.canRename || !renameInfo.triggerSpan) {
          return null;
        }
        return {
          range: rangeForSpan(
            uri,
            renameInfo.triggerSpan.start,
            renameInfo.triggerSpan.length,
            state.path
          ),
          placeholder:
            renameInfo.displayName || renameInfo.fullDisplayName || ""
        };
      };

      const handleRenameRequest = params => {
        const requestState = stateFromParams(params);
        if (!requestState) {
          return null;
        }
        const position = params.position;
        const newName = params.newName;
        if (!newName.trim()) {
          return null;
        }
        const uri = requestState.uri;
        const state = requestState.state;
        const env = ensureEnvironment();
        const offset = offsetFromPosition(state.text, position);
        const renameInfo = env.languageService.getRenameInfo(state.path, offset, {
          allowRenameOfImportPath: false
        });
        if (!renameInfo || !renameInfo.canRename) {
          return null;
        }
        const renameLocations = env.languageService.findRenameLocations(
          state.path,
          offset,
          false,
          false,
          true
        ) || [];
        const changes = {};

        for (const location of renameLocations) {
          const path = normalizeDocumentPath(location.fileName);
          const targetUri = locationUriForPath(path, uri, state.path);
          if (!targetUri) {
            continue;
          }
          if (!changes[targetUri]) {
            changes[targetUri] = [];
          }
          changes[targetUri].push({
            range: rangeForSpan(
              targetUri,
              location.textSpan.start,
              location.textSpan.length,
              path
            ),
            newText: newName
          });
        }

        const changedUris = Object.keys(changes);
        if (changedUris.length === 0) {
          return null;
        }
        return { changes };
      };

      const handleWorkspaceSymbolRequest = params => {
        const query = params.query.trim().toLowerCase();
        const env = ensureEnvironment();
        const symbols = [];
        const limit = 250;

        const visitItems = (uri, path, items, containerName) => {
          if (!Array.isArray(items)) {
            return;
          }
          for (const item of items) {
            if (!item || typeof item !== "object") {
              continue;
            }
            if (symbols.length >= limit) {
              return;
            }
            const name = typeof item.text === "string" ? item.text : "";
            const isScriptRoot = item.kind === ts.ScriptElementKind.scriptElement;
            const span =
              item.spans && Array.isArray(item.spans) && item.spans.length > 0
                ? item.spans[0]
                : item.textSpan;
            const nextContainerName = isScriptRoot ? containerName : name;

            if (!isScriptRoot && name && span) {
              const passesQuery =
                !query || name.toLowerCase().includes(query);
              if (passesQuery) {
                symbols.push({
                  name,
                  kind: documentSymbolKindFromTypeScriptKind(item.kind),
                  location: {
                    uri,
                    range: rangeForSpan(uri, span.start, span.length, path)
                  },
                  containerName: containerName || undefined
                });
              }
            }

            visitItems(uri, path, item.childItems, nextContainerName);
            if (symbols.length >= limit) {
              return;
            }
          }
        };

        for (const [uri, state] of docStateByUri.entries()) {
          const tree = env.languageService.getNavigationTree(state.path);
          if (!tree) {
            continue;
          }
          visitItems(uri, state.path, tree.childItems, "");
          if (symbols.length >= limit) {
            break;
          }
        }

        return symbols;
      };

      const handleKernelLspMessage = (comm, payload) => {
        let message;
        try {
          message = JSON.parse(payload);
        } catch {
          sendErrorResponse(comm, null, -32700, "Parse error");
          return;
        }
        if (!message || typeof message !== "object") {
          sendErrorResponse(comm, null, -32600, "Invalid Request");
          return;
        }

        const id = Object.prototype.hasOwnProperty.call(message, "id")
          ? message.id
          : undefined;
        const method = message.method;
        const params = message.params;

        if (typeof method !== "string") {
          if (id !== undefined) {
            sendErrorResponse(comm, id, -32600, "Invalid Request");
          }
          return;
        }

        if (method === "initialize") {
          sendResponse(comm, id, {
            capabilities: {
              textDocumentSync: 2,
              completionProvider: {
                resolveProvider: false,
                triggerCharacters: [".", "'", '"', "/", "@"]
              },
              signatureHelpProvider: {
                triggerCharacters: ["(", ",", "<"],
                retriggerCharacters: [")"]
              },
              hoverProvider: true,
              declarationProvider: true,
              definitionProvider: true,
              typeDefinitionProvider: true,
              implementationProvider: true,
              referencesProvider: true,
              documentHighlightProvider: true,
              documentSymbolProvider: true,
              renameProvider: {
                prepareProvider: true
              },
              workspaceSymbolProvider: true
            },
            serverInfo: {
              name: "plugin-playground-typescript-kernel",
              version: ts.version
            }
          });
          return;
        }
        if (method === "initialized") {
          return;
        }
        if (method === "shutdown") {
          sendResponse(comm, id, null);
          return;
        }
        if (method === "exit") {
          return;
        }

        try {
          if (method === "textDocument/didOpen") {
            const uri = updateDocumentFromNotification(params);
            if (uri) {
              publishDiagnostics(comm, uri);
            }
            return;
          }
          if (method === "textDocument/didChange") {
            const uri = updateDocumentFromNotification(params);
            if (uri) {
              publishDiagnostics(comm, uri);
            }
            return;
          }
          if (method === "textDocument/didSave") {
            publishDiagnostics(comm, updateDocumentFromNotification(params));
            return;
          }
          if (method === "textDocument/didClose") {
            const uri = params.textDocument.uri;
            sendMessage(comm, {
              jsonrpc: "2.0",
              method: "textDocument/publishDiagnostics",
              params: {
                uri,
                diagnostics: []
              }
            });
            const closedState = docStateByUri.get(uri);
            if (closedState && uriByPath.get(closedState.path) === uri) {
              uriByPath.delete(closedState.path);
            }
            docStateByUri.delete(uri);
            environmentDirty = true;
            return;
          }
          if (method === "textDocument/completion") {
            sendResponse(comm, id, handleCompletionRequest(params));
            return;
          }
          if (method === "completionItem/resolve") {
            sendResponse(comm, id, params);
            return;
          }
          if (method === "textDocument/hover") {
            sendResponse(comm, id, handleHoverRequest(params));
            return;
          }
          if (method === "textDocument/signatureHelp") {
            sendResponse(comm, id, handleSignatureHelpRequest(params));
            return;
          }
          if (method === "textDocument/definition") {
            sendResponse(comm, id, handleDefinitionRequest(params));
            return;
          }
          if (method === "textDocument/declaration") {
            sendResponse(comm, id, handleDefinitionRequest(params));
            return;
          }
          if (method === "textDocument/typeDefinition") {
            sendResponse(comm, id, handleTypeDefinitionRequest(params));
            return;
          }
          if (method === "textDocument/implementation") {
            sendResponse(comm, id, handleImplementationRequest(params));
            return;
          }
          if (method === "textDocument/references") {
            sendResponse(comm, id, handleReferencesRequest(params));
            return;
          }
          if (method === "textDocument/documentHighlight") {
            sendResponse(comm, id, handleDocumentHighlightRequest(params));
            return;
          }
          if (method === "textDocument/documentSymbol") {
            sendResponse(comm, id, handleDocumentSymbolRequest(params));
            return;
          }
          if (method === "textDocument/prepareRename") {
            sendResponse(comm, id, handlePrepareRenameRequest(params));
            return;
          }
          if (method === "textDocument/rename") {
            sendResponse(comm, id, handleRenameRequest(params));
            return;
          }
          if (method === "workspace/symbol") {
            sendResponse(comm, id, handleWorkspaceSymbolRequest(params));
            return;
          }

          if (id !== undefined) {
            sendErrorResponse(comm, id, -32601, "Method not found: " + method);
          }
        } catch (error) {
          const message =
            error && typeof error.message === "string"
              ? error.message
              : String(error);
          if (id !== undefined) {
            sendErrorResponse(comm, id, -32603, message);
          }
        }
      };

      const registerPluginPlaygroundTypeScriptLspTarget = comm => {
        comm.onMsg = message => {
          handleKernelLspMessage(comm, message.content.data.payload);
        };
      };

      globalThis.__pluginPlaygroundRegisterTypeScriptLspTarget =
        registerPluginPlaygroundTypeScriptLspTarget;
})();`;
}
