# Repository Guidelines

## Project Overview

ModelMix is a CommonJS Node.js library for LLM providers, fallback chains, rate limiting, templates, multimodal requests, and MCP tools. Node is not pinned; the root uses pnpm 11.18 and requires no compilation.

## Project Structure & Module Organization

- `index.js` owns the public API and provider classes; synchronize public contracts with `index.d.ts`.
- Root helper modules isolate effort mapping, schemas, HTTP, multipart, and MCP behavior.
- `test/*.test.js` contains Mocha suites; fixtures and setup live under `test/`.
- `demo/` holds examples and a separate npm manifest; `skills/modelmix/` contains the published skill.
- `node_modules/` is generated and ignored. Update `pnpm-lock.yaml` only through pnpm.

## Build, Test, and Development Commands

- `pnpm install` installs locked root dependencies.
- `pnpm test` runs the complete Mocha suite with shared setup.
- `pnpm run test:offline` runs the main mocked regressions without intentional live-provider coverage.
- `pnpm run test:templates`, `pnpm run test:fallback`, and `pnpm run test:watch` support focused development.
- `pnpm run test:live` and `pnpm run test:live.mcp` require real credentials, may incur costs, and must be reported separately.

No build, lint, formatter, or standalone typecheck command is configured. Do not add tooling or dependencies without approval.

## Coding Style & Naming Conventions

Use four-space indentation, semicolons, single quotes, CommonJS `require`, `camelCase`, and `PascalCase` classes. Keep provider behavior in `Mix*` classes. Public shortcut changes must update implementation, declarations, tests, docs, demos, and the skill together. Add aliases only with approval.

## Testing Guidelines

Use Mocha, Chai, Sinon, and Nock. Name regression files `*.test.js`; reproduce bugs before fixing them. Offline tests must not depend on order or real keys. Prefer instance seams such as `_choiceRandom()` over global stubs.

## Configuration & Security

There is no configuration module: callers pass policy through `ModelMix.new({ config, options })`; credentials come from environment variables. Never commit `.env` files, credentials, secret payloads, or unrequested defaults.

## Commit & Pull Request Guidelines

History favors short imperative subjects, commonly `feat:`, `fix:`, or `chore:`. Keep commits scoped and do not commit unless requested. Pull requests should explain behavior and compatibility impact, link issues, and list exact test commands and results; include screenshots only for visible changes.

## Domain & Contributor Conventions

A **provider** is an API backend, a **model shortcut** is a fluent method, and a **fallback chain** is ordered. Write code and docs in English; reply in the contributor's language.
