// Stub for the `server-only` module so server-restricted code can be
// exercised from vitest. The real package throws on import to prevent
// accidental client-bundle inclusion; in tests there is no client bundle.
export {};
