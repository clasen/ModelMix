# Repository Guidelines

## Project Overview

ModelMix is a TypeScript Node.js library, published as compiled CommonJS, for LLM providers, fallback chains, rate limiting, templates, multimodal requests, and MCP tools. Node is not pinned; the root uses pnpm, and `tsc` compiles `src/` to `dist/`.

## Project Structure & Module Organization

- `src/index.ts` owns the public API and the execution pipeline; `src/types.ts` holds the public types. Declarations are generated into `dist/`.
- `src/lib/providers/` holds the `Mix*` provider classes, which never depend on `ModelMix`. Providers declare `static apiKeyEnv`, `apiKeyName`, and `family`.
- `src/lib/model-registry.ts` is the single source for model shortcuts, their provider routes, and `mix` defaults; `src/index.ts` generates the fluent methods and `chain()` validates against it.
- Helper modules in `src/` isolate effort mapping, schemas, HTTP, multipart, and MCP behavior; `src/lib/` holds the remaining internals (API key checks, debug formatting, templates, token usage).
- `test/*.test.js` contains Mocha suites that run against `dist/`; fixtures and setup live under `test/`. Plugins under `plugins/` are still JavaScript.
- `dist/` is generated and ignored by git; `.npmignore` keeps it in the published package.
- `demo/` holds examples and a separate npm manifest; `skills/modelmix/` contains the published skill.
- `node_modules/` is generated and ignored. Update `pnpm-lock.yaml` only through pnpm.

## Build, Test, and Development Commands

- `pnpm install` installs locked root dependencies.
- `pnpm run build` compiles `src/` with `tsc`; every test script builds first.
- `pnpm test` runs the complete Mocha suite with shared setup.
- `pnpm run test:offline` runs the main mocked regressions without intentional live-provider coverage.
- `pnpm run test:bun` runs the same offline regressions on the Bun runtime.
- `pnpm run test:templates`, `pnpm run test:fallback`, and `pnpm run test:watch` support focused development.
- `pnpm run test:live` and `pnpm run test:live.mcp` require real credentials, may incur costs, and must be reported separately.

No lint or formatter is configured; `pnpm run build` is the typecheck. Do not add tooling or dependencies without approval.

## Coding Style & Naming Conventions

Use strict TypeScript with ES `import`/`export`, four-space indentation, semicolons, single quotes, `camelCase`, and `PascalCase` classes. Avoid enums, namespaces, and parameter properties; prefer `unknown` over `any` at boundaries. Keep provider behavior in `Mix*` classes. Public shortcut changes must update implementation, declarations, tests, docs, demos, and the skill together. Add aliases only with approval.

## Testing Guidelines

Use Mocha, Chai, Sinon, and Nock. Name regression files `*.test.js`; reproduce bugs before fixing them. Offline tests must not depend on order or real keys. Prefer instance seams such as `_choiceRandom()` over global stubs.

## Configuration & Security

There is no configuration module: callers pass policy through `ModelMix.new({ config, options })`; credentials come from environment variables. Never commit `.env` files, credentials, secret payloads, or unrequested defaults.

## Commit & Pull Request Guidelines

History favors short imperative subjects, commonly `feat:`, `fix:`, or `chore:`. Keep commits scoped and do not commit unless requested. Pull requests should explain behavior and compatibility impact, link issues, and list exact test commands and results; include screenshots only for visible changes.

## Domain & Contributor Conventions

A **provider** is an API backend, a **model shortcut** is a fluent method, and a **fallback chain** is ordered. Write code and docs in English; reply in the contributor's language.
