// Polyfill Symbol.metadata for Colyseus schema 3.x TC39 decorators.
//
// Background: TC39 standard decorators store class metadata at `Class[Symbol.metadata]`.
// V8 / Node only shipped that well-known symbol natively in very recent versions; on older
// Node it's undefined and the schema encoder crashes with:
//   "Cannot read properties of undefined (reading 'Symbol(Symbol.metadata)')"
//
// This file MUST be the first import in src/index.ts. ES modules evaluate top-level code
// in import order, so importing this before anything that decorates a schema class
// guarantees the symbol exists when decorators run.
(globalThis.Symbol as { metadata?: symbol }).metadata ??= Symbol.for('Symbol.metadata');

export {};
