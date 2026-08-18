# ModelMix Plugin Architecture and RLM Plugin Specification

Status: living draft

This document records the product and engineering decisions for adding a generic
plugin architecture to ModelMix and implementing Recursive Language Model (RLM)
behavior in a separately installed plugin. Confirmed decisions are normative.
Items marked **Open** are not implementation-ready and will be resolved before
development starts.

## 1. Goals

### Generic ModelMix plugin architecture

- Let a plugin extend one `ModelMix` instance without affecting other instances.
- Let plugins inspect or transform a prepared request before provider execution.
- Let plugins wrap an execution as middleware and either call the next handler or
  return the final result themselves.
- Let plugins start child ModelMix executions with explicit control over plugin
  inheritance.
- Keep plugin-specific dependencies and behavior out of the ModelMix package.

### RLM plugin

- Let applications submit prompts and documents that would otherwise consume a
  very large context window.
- Keep bulk document content outside the planner model's context.
- Represent structured input as programmatically accessible variables.
- Let a planner model generate a program that inspects those variables,
  decomposes an abstract task, and invokes other language models recursively.
- Let the planner choose faster, cheaper, or more capable workers for each
  subtask using an explicit worker catalog.
- Execute model-generated code in a restricted environment with controlled
  resource usage.

Translation is an example workload, not a special RLM operation. The same
mechanism must support summarization, extraction, analysis, rewriting,
classification, synthesis, and other tasks.

## 2. Non-goals

- ModelMix will not contain Markdown parsing, code isolation, RLM prompts, worker
  selection policy, or recursive orchestration logic.
- The ModelMix package will not depend on `isolated-vm` or the parser libraries
  selected by the RLM plugin.
- ModelMix will not assign universal intelligence rankings to models.
- The initial implementation will not silently activate plugins globally.

## 3. Package boundary

The feature is split into two deliverables:

1. **ModelMix core:** generic plugin registration, middleware execution, child
   invocation, execution metadata, and TypeScript declarations.
2. **RLM plugin:** document structuring, planner instructions, worker catalog,
   recursion policy, sandbox execution, limits, and RLM-specific diagnostics.

`@modelmix/rlm` is used as a working package name in examples and is not yet a
confirmed publication name.

## 4. Instance-scoped registration

A plugin is installed separately and activated explicitly on an instance:

```js
const { ModelMix } = require('modelmix');
const { rlm } = require('@modelmix/rlm');

const mmix = ModelMix.new()
    .gpt56luna()
    .use(rlm({
        maxDepth: 3
    }));
```

Confirmed behavior:

- `.use(plugin)` affects only that instance and instances that inherit from it.
- Registering a plugin does not change global ModelMix behavior.
- Instances without plugins retain their existing execution behavior.

## 5. Generic middleware contract

A plugin can wrap the complete ModelMix execution:

```js
const plugin = {
    name: 'example',

    async execute(context, next) {
        // Option A: inspect or modify the request, then continue.
        return next();

        // Option B: perform custom work and return a complete result without
        // invoking the provider handler or later middleware.
    }
};
```

The execution context needs a provider-neutral request representation:

```ts
interface PluginExecutionContext {
    request: {
        system: string;
        messages: ChatMessage[];
        options: ModelMixOptions;
        config: ModelMixConfig;
        outputMode: 'message' | 'json' | 'block' | 'raw' | 'stream';
    };
    execution: {
        executionId: string;
        parentExecutionId: string | null;
        depth: number;
    };
    invoke(input: ChildInvocation): Promise<ModelMixResult>;
}
```

Confirmed behavior:

- Calling `next()` continues the middleware chain and eventually invokes the
  selected provider.
- A plugin can short-circuit the chain and return the final result.
- A short-circuit result must satisfy the normal `ModelMixResult` contract so
  that `.message()`, `.json()`, `.block()`, and `.raw()` remain consistent.
- RLM-specific concepts must not appear in this core interface.

**Open:** exact mutability rules for `context.request`, middleware ordering,
duplicate plugin names, registration-time lifecycle hooks, teardown, and error
hooks.

## 6. Child invocation and plugin inheritance

Plugins can start independent child executions through `context.invoke()`:

```js
const result = await context.invoke({
    system: 'Extract the named entities from this section.',
    messages: [{ role: 'user', content: section }],
    plugins: 'inherit',
    history: false
});
```

Confirmed defaults:

- Child executions inherit all plugins, including the plugin that created the
  child invocation.
- Child executions never inherit conversation history by default.
- A child receives only the system prompt, messages, tools, options, and other
  inputs explicitly supplied for that invocation.
- The runtime records `executionId`, `parentExecutionId`, and `depth` across the
  execution tree.
- `.new()` inherits registered plugins but starts without message history,
  consistent with its current instance-creation behavior.

The generic API must support selective inheritance:

```js
plugins: 'inherit'
plugins: 'none'
plugins: { exclude: ['rlm'] }
plugins: { include: ['metrics'] }
```

**Open:** whether `history: true` will be supported at all. RLM child calls will
always use `history: false`, even if the generic architecture later permits
other plugins to request history explicitly.

## 7. Recursive depth

RLM uses an explicitly configured recursion limit:

```js
rlm({ maxDepth: 3 })
```

The current depth definition is:

| Depth | Meaning |
|---:|---|
| 0 | Initial planning execution |
| 1 | First recursive decomposition |
| 2 | Second recursive decomposition |
| 3 | Last RLM-enabled decomposition |
| 4 | Direct leaf execution with RLM excluded |

`maxDepth` is required. Registration must fail early when it is absent, invalid,
or negative. There is no implicit fallback value.

Current working decision: when the next invocation would exceed `maxDepth`, the
runtime excludes only RLM and sends the selected fragment directly to the chosen
worker. Other inherited plugins remain active.

## 8. Worker catalog and model selection

The initial planner must be able to choose among named workers with different
capability, cost, and speed characteristics. Each worker is a ModelMix instance
and can therefore contain its own provider fallback chain.

Proposed configuration:

```js
const workers = {
    fast: {
        model: ModelMix.new().gpt5nano(),
        intelligence: 1,
        cost: 1,
        speed: 5,
        description: 'Extraction, classification, and simple transformations'
    },
    balanced: {
        model: ModelMix.new().gpt5nano(),
        intelligence: 3,
        cost: 2,
        speed: 4,
        description: 'General analysis and writing'
    },
    expert: {
        model: ModelMix.new().gpt56luna(),
        intelligence: 5,
        cost: 5,
        speed: 2,
        description: 'Complex reasoning and final synthesis'
    }
};

const mmix = ModelMix.new()
    .gpt56luna()
    .use(rlm({ maxDepth: 3, workers }));
```

Confirmed requirements:

- The planner receives a manifest containing worker names and decision metadata,
  not ModelMix objects, credentials, or provider internals.
- The generated program selects a worker by its registered name.
- Different subtasks in the same execution can use different workers.
- Independent calls can use different workers concurrently.
- Worker intelligence is developer-supplied rather than inferred by ModelMix.
- ModelMix pricing data can supplement the relative cost rating when pricing is
  available.
- A worker can define its own fallback chain.
- RLM supports both an explicit worker pool and inherited use of the parent
  instance's model chain.

Proposed sandbox API:

```js
const entities = await query({
    worker: 'fast',
    system: 'Extract named entities.',
    message: chapter
});
```

**Open:** exact rating scale, whether the parent chain appears as a `default`
worker, worker capability tags, monetary price representation, and enforcement
of budgets for cost, calls, generated tokens, wall time, and concurrency.

## 9. RLM input representation

The planner must not receive the full large document. It receives:

- the user's task;
- a compact description of the external data environment;
- variable names, types, sizes, and structural relationships;
- the worker manifest;
- the callable sandbox API;
- execution limits and output requirements.

The document remains available only inside the sandbox as structured variables.
For Markdown input, the intended semantic mapping is:

- headings define named sections and hierarchy;
- chapter-level sections become individually addressable variables;
- bullet and numbered lists become arrays when their structure permits it;
- nested headings become nested objects or an equivalent traversable tree;
- prose content remains external and is described by metadata such as character
  count rather than copied into the planner prompt;
- ordering and enough source metadata are preserved to reconstruct an output in
  the original document order.

For example, a ten-chapter book should expose ten addressable chapter values
instead of one opaque string. Generated code can select, inspect, partition, and
process those values without loading the entire book into the planner context.

### Variable metadata

The planner receives a content-free descriptor for every external variable. The
descriptor is operational input, not debug-only information: generated programs
use it together with the execution limits to decide whether to process a value
directly, batch array items, or split large strings at semantic boundaries.

Confirmed metadata:

- every variable has a stable path, type, and estimated serialized size;
- sizes use UTF-8 bytes of the JSON-serialized value so they are deterministic
  across JavaScript runtimes; strings also expose raw UTF-8 bytes;
- strings expose Unicode character, UTF-16 code-unit, line, and paragraph counts;
- arrays expose item count, element-type distribution, total serialized size,
  and minimum, maximum, and average serialized item size;
- homogeneous string arrays expose aggregate character, byte, line, and
  paragraph statistics;
- object arrays expose a content-free field manifest with presence, type, and
  string-size statistics instead of listing every item;
- objects expose key count and recursively described properties;
- descriptors never contain source strings, samples, credentials, ModelMix
  objects, or provider configuration;
- non-JSON-serializable values and circular references fail before planning.

The planner prompt includes the sandbox memory limit and maximum query payload
size beside the descriptor. It must instruct generated code to compare those
limits with variable and item sizes, split oversized strings at paragraph or
other semantic boundaries, batch compatible array items, process independent
work concurrently within the configured limit, and preserve source order when
reassembling output.

RLM prompts are developer-controlled Markdown templates stored in the plugin
package. They use ModelMix's existing EJS contract and are rendered through
`assign()` plus `setSystemFromFile()` on the planner execution. The plugin does
not own a second template renderer. Manifest JSON, limits, worker metadata, and
planning hints are assigned data, rendered once, and may not recursively execute
EJS contained in variable paths or other runtime values. Relative Markdown
includes use ModelMix's normal file-template resolution.

The byte count estimates serialized transfer size rather than the JavaScript
engine's heap usage. Runtime heap consumption is implementation-dependent and
is enforced separately by the sandbox memory limit.

**Open:** exact variable naming, duplicate headings, introductory content,
heading depth, code blocks, tables, links, frontmatter, mixed content, malformed
Markdown, non-Markdown prompts, and round-trip fidelity.

## 10. RLM execution flow

The intended high-level flow is:

1. ModelMix renders its system and message templates normally.
2. The RLM middleware receives the prepared provider-neutral request.
3. RLM separates the task instructions from large data-bearing content.
4. RLM parses structured content and creates the external variable environment.
5. RLM assigns the variable manifest, workers, callable API, limits, and output
   requirements to its Markdown planner template and lets ModelMix render it.
6. The initial model generates an executable orchestration program.
7. RLM validates and runs the program inside the restricted sandbox.
8. The program inspects variables and calls named workers through `query()`.
9. Independent subtasks run concurrently when allowed by configured limits.
10. Recursive calls re-enter RLM without history until the depth boundary.
11. The program combines intermediate results and returns the final value.
12. RLM converts that value into a normal `ModelMixResult`.

## 11. Isolation and security boundary

The RLM package owns the sandbox implementation and its dependency on
`isolated-vm` or a future replacement.

Required properties:

- Generated code cannot access Node.js globals, the filesystem, environment
  variables, network APIs, credentials, or ModelMix instances.
- Only serializable document variables and explicitly registered callbacks enter
  the sandbox.
- The only LLM operation exposed to generated code is the validated `query()`
  interface.
- Worker names and invocation arguments are validated outside the sandbox.
- Memory, execution time, recursion, calls, concurrency, and output size are
  enforceable outside model instructions.
- Sandbox disposal occurs on success, failure, timeout, or cancellation.

**Open:** concrete limit configuration and whether generated code is accepted
directly or parsed against a restricted JavaScript subset before execution.

## 12. Output modes

Because a plugin may complete an execution, RLM must preserve the caller's
chosen output mode:

- `.message()` returns a string.
- `.block()` returns extracted block content according to the existing contract.
- `.json()` returns data satisfying the requested schema.
- `.raw()` returns a complete `ModelMixResult`.
- `.stream()` requires an explicit streaming design.

**Open:** whether the first RLM version supports streaming. Recursive parallel
work does not naturally form one ordered token stream, so the likely initial
contract is either buffered final output or explicit rejection of `.stream()`.

## 13. Observability and accounting

An RLM result should make the execution tree inspectable without exposing prompt
content by default. Candidate metadata includes:

- planner and worker calls;
- selected worker per call;
- parent/child execution identifiers and depth;
- elapsed time and concurrency;
- input, output, cached, and cache-write tokens;
- estimated cost per call and aggregate cost;
- termination reason, including depth or budget boundaries.

**Open:** the public shape of this metadata and how it integrates with
`lastRaw.tokens`, debug levels, and plugins that also collect metrics.

## 14. Verification requirements

### ModelMix core

- Plugins are isolated per instance.
- `.new()` inherits plugins without inheriting history.
- Middleware executes in deterministic order.
- A plugin can transform a request and call `next()`.
- A plugin can return a complete result without calling `next()`.
- Child invocations support inherit, none, include, and exclude policies.
- Execution identifiers and depth are correct across nested calls.
- Plugin failures do not silently fall through to providers.
- Existing behavior remains unchanged when no plugins are registered.
- All supported non-streaming output modes preserve their contracts.

### RLM package

- Markdown fixtures produce stable semantic variable environments.
- Large content is absent from the planner request.
- The planner can choose among named workers.
- Independent queries execute concurrently within configured limits.
- Recursive calls contain no conversation history.
- The depth boundary excludes RLM and terminates recursion.
- Invalid workers and malformed generated code fail clearly.
- Sandbox access to filesystem, environment, network, and Node APIs is denied.
- Time, memory, call, concurrency, and output limits are enforced.
- Results and accounting aggregate planner and worker executions.
- A large-document fixture covers an abstract operation end to end with mocked
  providers; translation can be one example but not the only tested task.

## 15. Evidence from the current laboratory

The prototypes under `demo/lab/` establish the initial direction:

- `rlm-translate.js` describes external data to a planner, generates an async
  JavaScript program, exposes an LLM callback, and executes the program in
  `isolated-vm`.
- `rlm-story.js` demonstrates parallel and sequential query planning over an
  abstract task without document input.
- The current translation prototype exposes the entire Markdown document as one
  `input` string and chunks it by character count. The production plugin must
  replace this with semantic document structure and enforced runtime policy.

The generic hook belongs after ModelMix has rendered templates into a request
snapshot and before provider-specific message conversion. This preserves one
neutral plugin contract across OpenAI, Anthropic, Google, and other providers.

## 16. Decisions still required before implementation

1. Hard budgets and what happens when each budget is exhausted.
2. Exact worker metadata and selection contract.
3. Middleware ordering and plugin lifecycle.
4. Request mutability and validation between middleware stages.
5. Markdown-to-variable mapping and non-Markdown behavior.
6. Separation of task instructions from data-bearing prompt content.
7. Tools available to child executions.
8. Output schema propagation and final-result validation.
9. Streaming and cancellation behavior.
10. Metrics, token accounting, and debug representation.
11. Package name and supported module formats.
