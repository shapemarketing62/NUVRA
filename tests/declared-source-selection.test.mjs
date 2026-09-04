import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import ts from "typescript";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))), "..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) request = path.join(root, request.slice(2));
  return originalResolve.call(this, request, parent, isMain, options);
};
require.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { selectAnalysisWebUrl, selectPrimaryInstagram } = require("../services/discovery/source-selection.ts");

test("una declaración de ausencia no bloquea una web descubierta y validada después", () => {
  assert.equal(selectAnalysisWebUrl({
    noWebDeclared: true,
    declaredWebUrl: null,
    storedWebUrl: null,
    discoveredWebUrl: "https://otra-entidad.example",
  }), "https://otra-entidad.example");
});

test("una declaración de ausencia no reutiliza una URL declarada o guardada sin discovery actual", () => {
  assert.equal(selectAnalysisWebUrl({ noWebDeclared: true, declaredWebUrl: "https://vieja.example", storedWebUrl: "https://guardada.example", discoveredWebUrl: null }), null);
});

test("sin declaración de ausencia se conserva el orden web declarada, guardada y descubierta", () => {
  assert.equal(selectAnalysisWebUrl({ noWebDeclared: false, declaredWebUrl: "https://declarada.example", storedWebUrl: "https://guardada.example", discoveredWebUrl: "https://descubierta.example" }), "https://declarada.example");
  assert.equal(selectAnalysisWebUrl({ noWebDeclared: false, storedWebUrl: "https://guardada.example", discoveredWebUrl: "https://descubierta.example" }), "https://guardada.example");
  assert.equal(selectAnalysisWebUrl({ noWebDeclared: false, discoveredWebUrl: "https://descubierta.example" }), "https://descubierta.example");
});

test("el Instagram declarado prevalece sobre otro perfil descubierto", () => {
  assert.equal(
    selectPrimaryInstagram("https://instagram.com/nomacafe.ba/", "https://instagram.com/noma.coffee/"),
    "https://instagram.com/nomacafe.ba/",
  );
});
