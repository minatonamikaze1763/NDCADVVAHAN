#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const modules = path.resolve(root, "node_modules");
const out = path.join(root, "assets");
const tesseractOut = path.join(out, "tesseract");
const pdfOut = path.join(out, "pdfjs");
const modelOut = path.join(out, "models");

function fail(message) {
  console.error("[NDC Smart Scan assets] " + message);
  process.exitCode = 1;
}
function exists(file) {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}
function walk(dir, predicate, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, predicate, found);
    else if (predicate(file)) found.push(file);
  }
  return found;
}
function requiredPackage(name) {
  const dir = path.join(modules, ...name.split("/"));
  if (!fs.existsSync(dir)) fail("Missing dependency " + name + ". Run npm install in upload/smart-scan.");
  return dir;
}
function copy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  console.log("Copied " + path.relative(modules, source) + " -> " + path.relative(root, destination));
}
function choose(files, label) {
  const sorted = files.slice().sort((a, b) => a.length - b.length);
  if (!sorted.length) { fail("Could not locate " + label + " in installed npm packages."); return null; }
  return sorted[0];
}

function main() {
  if (!fs.existsSync(modules)) {
    fail("node_modules is missing. Run npm install in upload/smart-scan.");
    return;
  }
  fs.mkdirSync(tesseractOut, { recursive: true });
  fs.mkdirSync(pdfOut, { recursive: true });
  fs.mkdirSync(modelOut, { recursive: true });

  const tessJsDir = requiredPackage("tesseract.js");
  const coreDir = requiredPackage("tesseract.js-core");
  const engDir = requiredPackage("@tesseract.js-data/eng");
  const pdfDir = requiredPackage("pdfjs-dist");
  if (process.exitCode) return;

  const runtime = choose(walk(tessJsDir, p => /[/\\]dist[/\\]tesseract\.min\.js$/.test(p)), "Tesseract.js browser bundle");
  const worker = choose(walk(tessJsDir, p => /[/\\]dist[/\\]worker\.min\.js$/.test(p)), "Tesseract.js browser worker");
  const cores = walk(coreDir, p => /tesseract-core.*\.wasm(?:\.js)?$/.test(p));
  const model = choose(walk(engDir, p => /eng\.traineddata(?:\.gz)?$/.test(p)), "English traineddata model");
  const pdf = choose(walk(pdfDir, p => /[/\\]build[/\\]pdf(?:\.min)?\.mjs$/.test(p)), "PDF.js browser module");
  const pdfWorker = choose(walk(pdfDir, p => /[/\\]build[/\\]pdf\.worker(?:\.min)?\.mjs$/.test(p)), "PDF.js browser worker");
  if (!runtime || !worker || !cores.some(p => p.endsWith(".wasm.js")) || !cores.some(p => p.endsWith(".wasm")) || !model || !pdf || !pdfWorker) return;

  copy(runtime, path.join(tesseractOut, "tesseract.min.js"));
  copy(worker, path.join(tesseractOut, "worker.min.js"));
  for (const core of cores) copy(core, path.join(tesseractOut, path.basename(core)));
  copy(model, path.join(modelOut, path.basename(model).endsWith(".gz") ? "eng.traineddata.gz" : "eng.traineddata"));
  copy(pdf, path.join(pdfOut, "pdf.mjs"));
  copy(pdfWorker, path.join(pdfOut, "pdf.worker.mjs"));
  const cmaps = path.join(pdfDir, "cmaps");
  const standardFonts = path.join(pdfDir, "standard_fonts");
  if (fs.existsSync(cmaps)) fs.cpSync(cmaps, path.join(pdfOut, "cmaps"), { recursive: true });
  if (fs.existsSync(standardFonts)) fs.cpSync(standardFonts, path.join(pdfOut, "standard_fonts"), { recursive: true });

  const required = [
    "tesseract/tesseract.min.js", "tesseract/worker.min.js",
    "tesseract/tesseract-core-lstm.wasm.js", "models/eng.traineddata.gz",
    "pdfjs/pdf.mjs", "pdfjs/pdf.worker.mjs"
  ];
  const missing = required.filter(name => !exists(path.join(out, name)));
  if (missing.length) {
    for (const file of missing) console.error("[NDC Smart Scan assets] Missing output: " + file);
    process.exitCode = 1;
    return;
  }
  console.log("[NDC Smart Scan assets] OCR and PDF assets are ready in upload/smart-scan/assets.");
}
main();
