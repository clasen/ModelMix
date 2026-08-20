---
name: modelmix
description: Instructions for using the ModelMix Node.js library to interact with multiple AI LLM providers through a unified interface. Use when writing code that calls AI models (OpenAI, Anthropic, Google, Groq, Perplexity, Grok, Moonshot, MiniMax, Fireworks, Together, Lambda, Cerebras, OpenRouter, Ollama, LM Studio), chaining models with fallback, getting structured JSON from LLMs, adding MCP tools, streaming responses, managing multi-provider AI workflows, round-robin load balancing, or rate limiting API requests in Node.js. Also use when the user mentions "modelmix", "ModelMix", asks to "call an LLM", "query a model", "add AI to my app", or wants to integrate any supported provider.
metadata:
  tags: [llm, ai, openai, anthropic, google, groq, perplexity, grok, mcp, streaming, json-output]
---

# ModelMix Library Skill

## Overview

ModelMix is a Node.js library providing a unified fluent API to interact with multiple AI LLM providers. It handles automatic fallback between models, round-robin load balancing, structured JSON output, streaming, MCP tool integration, custom local tools, rate limiting, and token tracking.

Use this skill when:
- Integrating one or more AI models into a Node.js project
- Chaining models with automatic fallback or round-robin
- Extracting structured JSON from LLMs
- Adding MCP tools or custom tools to models
- Streaming responses from any provider
- Working with templates and file-based prompts
- Tracking token usage and costs

Do NOT use for:
- Python or non-Node.js projects
- Direct HTTP calls to LLM APIs (use ModelMix instead)

## Quick Reference

- [Installation](#installation)
- [Creating an instance](#creating-an-instance)
- [Attaching models](#attaching-models)
- [Unified effort](#unified-effort)
- [Get a text response](#get-a-text-response)
- [Get structured JSON](#get-structured-json)
- [Stream a response](#stream-a-response)
- [Extract a code block](#extract-a-code-block)
- [Get raw response (tokens, thinking, tool calls)](#get-raw-response)
- [Access full response with lastRaw](#access-full-response-with-lastraw)
- [Add images](#add-images)
- [EJS templates](#ejs-templates)
- [Round-robin load balancing](#round-robin-load-balancing)
- [MCP integration](#mcp-integration)
- [Custom local tools](#custom-local-tools)
- [Rate limiting](#rate-limiting)
- [Conversation history](#conversation-history)
- [Debug mode](#debug-mode)
- [Free-tier models](#free-tier-models)
- [Multi-provider routing](#multi-provider-routing)

## Installation

```bash
npm install modelmix
```

## Core Concepts

### Import

```javascript
import { ModelMix } from 'modelmix';
```

### Creating an Instance

```javascript
const model = ModelMix.new();

const model = ModelMix.new({
    options: { max_tokens: 4096, temperature: 0.7 },
    config: {
        system: "You are a helpful assistant.",
        max_history: 5,   // -1 = unlimited, 0 = none (default), N = keep last N
        debug: 0,          // 0=silent, 1=minimal, 2=summary, 3=full, 4=verbose
        roundRobin: false, // false=fallback, true=rotate models
        effort: 50         // unified 0..100, or -1 adaptive
    }
});
```

### Attaching Models

Chain shorthand methods to attach providers. First model is primary; others are fallbacks (or rotated if `roundRobin: true`):

```javascript
const model = ModelMix.new()
    .sonnet46()        // primary
    .gpt52()           // fallback 1
    .gemini37flash()   // fallback 2
    .addText("Hello!")
```

If `sonnet46` fails, it automatically tries `gpt52`, then `gemini37flash`.

The equivalent `chain()` form accepts public shortcut names directly in the
same order. Append `@effort` for a per-model unified effort override (`-1` or
`0`–`100`). Without the suffix, the entry inherits `config.effort`, or keeps the
provider default when no chain effort is configured:

```javascript
const model = ModelMix.new()
    .chain('sonnet46', 'gpt52@20', 'gemini37flash@-1')
    .addText('Hello!');
```

### Instance plugins

Register middleware with `.use({ name, execute })`. Plugins are scoped to the instance, run in registration order, and receive the rendered provider-neutral request. They may edit `context.request`, call `next()`, or return a complete ModelMix result.

```javascript
model.use({
    name: 'metrics',
    async execute(context, next) {
        const result = await next();
        return { ...result, executionId: context.execution.executionId };
    }
});
```

`context.invoke()` starts a child without conversation history. Its `plugins` policy is `'inherit'`, `'none'`, `{ include: [...] }`, or `{ exclude: [...] }`. Passing `model` routes the child through another ModelMix worker chain while preserving execution-tree metadata. Child invocations may pass `assign` with either `system` or `systemFile`; `systemFile` uses the ordinary ModelMix EJS renderer and relative includes.

The optional `@modelmix/rlm` package is a separate workspace/npm package for recursive processing of large structured inputs. Pass Markdown through `documents: { name: { format: 'markdown', content } }`, register named ModelMix worker chains, and provide every runtime limit explicitly. A worker uses either `model: anotherModelMixInstance` or `useParent: true`. Its planner sees content-free variable size/shape metadata, while document values and generated orchestration code stay inside an `isolated-vm` sandbox. RLM planner prompts are Markdown files rendered with the normal child `assign` plus `systemFile` path.

### Unified effort

Provider-agnostic reasoning intensity. **Not** an `options` field — use `config.effort` or `.effort(n)`.

```javascript
ModelMix.new({ config: { effort: 40 } }).sonnet46().addText('Plan this refactor').message();
ModelMix.new().deepseekV4Flash({ config: { effort: 100 } }).addText('...').message();
ModelMix.new().effort(-1).minimaxM3().addText('Quick question').message();

// Native provider fields win when already set
ModelMix.new({ config: { effort: 80 } })
  .gpt52({ options: { reasoning_effort: 'none' } }) // stays none
```

| | 0–19 | 20–39 | 40–59 | 60–79 | 80–100 | `-1` |
|--|------|-------|-------|-------|--------|------|
| OpenAI | `none` | `low` | `medium` | `high` | `xhigh` | — |
| Anthropic | `low` | `medium` | `high` | `xhigh` | `max` | adaptive |
| Gemini 3+\* | `minimal` | `low` | `medium` | `high` | — | dynamic |
| DeepSeek V4 | off | `low`↑ | `high`↑ | `high`↑ | `max`↑ | — |
| MiniMax M3 | off | adaptive | adaptive | adaptive | adaptive | adaptive |

\* GPT-5.6 maps `100` to `max`; 80–99 remains `xhigh`. Qwen 3.8 27B maps 0–39 / 40–79 / 80–100 to `low` / `medium` / `xhigh`. GLM 5.3 requires reasoning and maps those bands to `low` / `high` / `max`. Gemini bands: 0–24 / 25–49 / 50–74 / 75–100. Gemini 3.7 Flash supports only `low` / `medium` / `high`, so the first two bands clamp to `low`; `-1` keeps its native `medium` default. DeepSeek `↑` = thinking on; `off` = thinking disabled. MiniMax `off`/`adaptive` = `thinking.disabled` / `thinking.type=adaptive`. Gemini 2.5 maps 0–100 to `thinkingBudget`. Anthropic: adaptive + `output_config.effort` on Claude 5 / Fable / Opus 4.6+ / Sonnet 4.6+; Sonnet 4.5 / Haiku 4.5 use `thinking.type=enabled` + `budget_tokens`. Grok 4.6 maps 0–39 / 40–59 / 60–79 / 80–100 to `low` / `medium` / `high` / `xhigh`; without effort it uses native `high`. `-1` = adaptive/dynamic when available, else no-op. Levels clamp per model. Former `*think()` methods are removed — use `.effort(n).<model>()`. Kimi: `kimiK25()` / `kimiK26()`. Grok 4.20: `.grok420()` non-reasoning; `.effort(20+|-1).grok420()` selects reasoning.

## Available Model Shorthands

### OpenAI

Use `ModerationMix.new().openai()` with `.raw()` to classify text and images through OpenAI's Moderations endpoint. Read the results from `raw.moderation`. `ModerationMix` accepts moderation providers as ordered fallbacks, rejects generative providers, and does not generate text or support streaming.

`gpt52()` `gpt52chat()` `gpt51()` `gpt5()` `gpt5mini()` `gpt5nano()` `gpt45()` `o3()` `o4mini()`

### Anthropic
`fable50()` `opus50()` `opus48()` `opus47()` `opus46()` `sonnet5()` `sonnet46()` `sonnet45()` `haiku45()`

Use `.effort(n)` (or `config.effort`) to enable Anthropic thinking — e.g. `.effort(100).opus50()`. `fable5()` and `opus5()` remain available as compatibility aliases.

### Google
`gemini31pro()` `gemini37flash()` `gemini36flash()` `gemini35flash()` `gemini35flashLite()` `gemini31flashLite()`

### Grok
`grok46()` `grok45()` `grok43()` `grok420multiAgent()` `grok420()`

### Perplexity
`sonar()` `sonarPro()`

### Together
`qwen36plus()` `GLM52()` `kimiK25()` `kimiK26()` `gptOss()`

### Moonshot
`kimiK3()` — requires `MOONSHOT_API_KEY`; use `{ mix: { moonshot: false, openrouter: true } }` for OpenRouter.

### MiniMax
`minimaxM27()` `minimaxM3()`

### Fireworks
`qwen36plus()` `qwen37plus()` `qwen38max()` `deepseekV4Flash()` `deepseekV4Pro()` `kimiK26()`

### Cerebras
`GLM46()`

### OpenRouter
`qwen35397b()` `qwen3827b()` `hermes470b()` `hermes4405b()` `qwen38max()` `GLM45()` `GLM53()`

### Multi-provider (auto-fallback across free/paid tiers)
`hermes3()` `kimiK25()`

### Local
`lmstudio()` — for LM Studio local models

Each method accepts optional `{ options, config }` to override per-model settings.

## Common Tasks

### Get a text response

```javascript
const answer = await ModelMix.new()
    .gpt5mini()
    .addText("What is the capital of France?")
    .message();
```

### Get structured JSON

```javascript
const result = await ModelMix.new()
    .gpt5mini()
    .addText("Name and capital of 3 South American countries.")
    .json(
        { countries: [{ name: "", capital: "" }] },
        { countries: [{ name: "country name", capital: "in uppercase" }] },
        { addNote: true }
    );
```

`json()` signature: `json(schemaExample, schemaDescription?, { addSchema, addExample, addNote }?)`

#### Enhanced descriptors

Descriptions can be strings or descriptor objects with metadata:

```javascript
const result = await model.json(
    { name: 'martin', age: 22, sex: 'Male' },
    {
        name: { description: 'Name of the actor', required: false },
        age: 'Age of the actor',
        sex: { description: 'Gender', enum: ['Male', 'Female', null] }
    }
);
```

Descriptor properties:

| Property | Type | Notes |
| --- | --- | --- |
| `description` | string | Field description for the model |
| `required` | boolean (default `true`) | `false` → removes from `required[]` **and** makes type nullable |
| `enum` | array | Restricts allowed values. Including `null` auto-makes the type nullable |
| `default` | any | Default value hint |
| `nullable` | boolean (default `false`) | `true` → makes type nullable but keeps field in `required[]` |

#### Nested object descriptions

Pass a plain object as the description value to annotate fields inside a nested object:

```javascript
model.json(
    { user: { name: 'Alice', age: 30 } },
    { user: { name: 'Full name', age: 'Age in years' } }
);
```

To mark the object itself as optional, use a descriptor (only `description`/`required`/`nullable` keys) — it applies to the parent, not the children:

```javascript
model.json(
    { user: { name: 'Alice', age: 30 } },
    { user: { description: 'User details', required: false } }
);
```

#### Array item descriptions

Wrap descriptions in an array to annotate items of an array field:

```javascript
model.json(
    { countries: [{ name: 'France', capital: 'Paris' }] },
    { countries: [{ name: 'Country name', capital: 'Capital in uppercase' }] }
);
```

#### Automatic type and format detection

Schema types are inferred from example values: `integer` (whole numbers), `number` (floats), `boolean`, `null`, `string`, and special formats:
- `'user@example.com'` → `{ type: 'string', format: 'email' }`
- `'1990-01-01'` → `{ type: 'string', format: 'date' }`
- `'14:30'` / `'09:15:45'` → `{ type: 'string', format: 'time' }`

#### Array auto-wrap

Top-level arrays are auto-wrapped as `{ out: [...] }` for better LLM compatibility, and unwrapped on return:

```javascript
const result = await model.json([{ name: 'martin' }]);
// result is an array: [{ name: "Martin" }, { name: "Carlos" }, ...]
```

### Stream a response

```javascript
await ModelMix.new()
    .gpt5mini()
    .addText("Tell me a story.")
    .stream(({ delta, message }) => {
        process.stdout.write(delta);
    });
```

### Extract a code block

```javascript
const code = await ModelMix.new()
    .gpt5mini()
    .addText("Write a hello world function in JavaScript.")
    .block();
// Returns only the content inside the first code block
```

`block()` accepts `{ addSystemExtra }` (default true) — adds system instructions that tell the model to wrap output in a code block.

### Get raw response

```javascript
const raw = await ModelMix.new()
    .effort(100)
    .sonnet45()
    .addText("Solve this step by step: 2+2*3")
    .raw();
// raw.message, raw.think, raw.tokens, raw.toolCalls, raw.response
```

### Access full response with lastRaw

After calling `message()`, `json()`, `block()`, or `stream()`, use `lastRaw` to access the complete response:

```javascript
const model = ModelMix.new().gpt5mini().addText("Hello!");
const text = await model.message();
console.log(model.lastRaw.tokens);
// {
//   input: 1200, output: 50, thinking: 0, total: 1250,
//   cached: 1024, cacheWrite: 0, uncachedInput: 176,
//   cacheWrite5m: 0, cacheWrite1h: 0,
//   cacheHitRate: 0.8533, cacheSavings: 0.00018432,
//   cacheWritePremium: 0, breakEvenHits: 0,
//   cost: 0.00011568,
//   costBreakdown: {
//     uncachedInput: 0.0000352, cachedInput: 0.00002048,
//     cacheWrite: 0, cacheWrite5m: 0, cacheWrite1h: 0,
//     output: 0.00006, total: 0.00011568
//   },
//   speed: 38
// }
console.log(model.lastRaw.think);    // reasoning content (if available)
console.log(model.lastRaw.response); // raw API response
```

### GPT-5.6 explicit prompt caching

```javascript
const model = ModelMix.new()
  .gpt56luna({
    options: {
      prompt_cache_key: 'stable-prefix-v1',
      prompt_cache_options: { mode: 'explicit', ttl: '30m' }
    }
  })
  .haiku45({
    options: {
      cache_control: { type: 'ephemeral', ttl: '1h' }
    }
  })
  .addText(longStableInstructions, {
    cache: { breakpoint: true }
  })
  .addText('Handle this variable request.');

const result = await model.raw();
```

`cache: { breakpoint: true }` is provider-neutral: GPT-5.6 receives `prompt_cache_breakpoint`, Anthropic receives `cache_control`, and unsupported providers omit it. Keep native request policies inside each model shorthand so they do not leak across fallbacks. Anthropic usage separates `cacheWrite5m` and `cacheWrite1h`; `cacheWrite` stays as their compatible aggregate.

GPT-5.6 replaces `prompt_cache_retention` with `prompt_cache_options.ttl`. Explicit breakpoints also work on image methods and Responses-native `input_text`, `input_image`, and `input_file` blocks. Prompts need at least 1,024 tokens to be cached. Requests over 272K input tokens use 2× input and 1.5× output prices for the complete request; ModelMix applies these multipliers to `cost`, `costBreakdown`, and cache economics.

### Add images

```javascript
const model = ModelMix.new().sonnet45();
model.addImage('./photo.jpg');                          // from file
model.addImageFromUrl('https://example.com/img.png');   // from URL
model.addImageFromBuffer(imageBuffer);                  // from Buffer
model.addText('Describe this image.');
const description = await model.message();
```

All image methods accept an optional second argument `{ role }` (default `"user"`).

### EJS templates

```javascript
const model = ModelMix.new().gpt5mini();
model.setSystemFromFile('./prompts/system.md');
model.addTextFromFile('./prompts/task.md');
model.assign({
    role: 'data analyst',
    language: 'Spanish'
});
console.log(await model.message());
```

Templates use standard EJS syntax. Use `<%- value %>` for raw prompt content and `<%= value %>` only when XML escaping is intentional. Missing variables and files throw. Templates may contain JavaScript, so the template source must be developer-controlled; untrusted content belongs only in `assign()` data.

Use `assignKey(key, value)` for one value and `assign({ ... })` for several values.

Start with a static include. Paths are resolved relative to the containing template:

```ejs
<%- include('shared/rules.md') %>
```

Use a variable when the included file must be selected dynamically:

```ejs
Analyze the following source:

<%- include(sourceFile) %>
```

```javascript
model.assign({ sourceFile: '../src/utils.js' });
```

Included files are EJS source, so the path and file must be developer-controlled. Untrusted runtime content belongs in ordinary `assign()` values, not include paths. To expose a rendered file as a data key, call `assignKeyFromFile(key, filePath)`; it uses EJS `include`, supports includes relative to that file, and renders once per request. For recursive data, a template may include itself with an explicit stopping condition:

```ejs
<%- node.text %>
<% if (node.children?.length && depth < maxDepth) { %>
<% for (const child of node.children) { %>
<%- include('tree.ejs', { node: child, depth: depth + 1, maxDepth }) %>
<% } %>
<% } %>
```

Initialize it with `assign({ node, depth: 0, maxDepth: 10 })`. Values supplied through `assign()` remain data and are never interpreted recursively as EJS.

Use ModelMix choice directives for random prompt variants:

```ejs
<% choice %>
<% option 20 %>
Use emojis.
<% option 40 %>
Use few emojis.
<% option 40 %>
Do not use emojis.
<% /choice %>
```

Omit all weights for equal probabilities. Otherwise every option needs a positive relative weight; weights do not need to total 100. Keep directives on their own lines. Nested choices and choices inside includes are supported. A request keeps its selections through retries, provider fallbacks, and tool continuations.

### Round-robin load balancing

```javascript
const pool = ModelMix.new({ config: { roundRobin: true } })
    .gpt5mini()
    .sonnet45()
    .gemini37flash();

const r1 = await pool.new().addText("Request 1").message();
const r2 = await pool.new().addText("Request 2").message();
```

### MCP integration

```javascript
const model = ModelMix.new({ config: { max_history: 10 } }).gpt5nano();
model.setSystem('You are an assistant. Today is ' + new Date().toISOString());
await model.addMCP('@modelcontextprotocol/server-brave-search');
model.addText('Use Internet: What is the latest news about AI?');
console.log(await model.message());
```

Requires `BRAVE_API_KEY` in `.env` for Brave Search MCP.

### Custom local tools

```javascript
const model = ModelMix.new({ config: { max_history: 10 } }).gpt5mini();

model.addTool({
    name: "get_weather",
    description: "Get weather for a city",
    inputSchema: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"]
    }
}, async ({ city }) => {
    return `The weather in ${city} is sunny, 25C`;
});

model.addText("What's the weather in Tokyo?");
console.log(await model.message());
```

Register multiple tools at once:

```javascript
model.addTools([
    { tool: { name: "tool_a", description: "...", inputSchema: {...} }, callback: async (args) => {...} },
    { tool: { name: "tool_b", description: "...", inputSchema: {...} }, callback: async (args) => {...} }
]);
```

Manage tools: `model.removeTool("tool_a")` and `model.listTools()` → `{ local, mcp }`.

### Rate limiting

```javascript
const model = ModelMix.new({
    config: {
        bottleneck: {
            maxConcurrent: 4,
            minTime: 1000
        }
    }
}).gpt5mini();
```

### Conversation history

```javascript
const chat = ModelMix.new({ config: { max_history: 10 } }).gpt5mini();
chat.addText("My name is Martin.");
await chat.message();
chat.addText("What's my name?");
const reply = await chat.message();  // "Martin"
```

`max_history`: 0 = no history (default), N = keep last N exchanges, -1 = unlimited.

### Debug mode

```javascript
const model = ModelMix.new({
    config: { debug: 2 }  // 0=silent, 1=minimal, 2=summary, 3=full, 4=verbose
}).gpt5mini();
```

For full debug output, also set: `DEBUG=ModelMix* node script.js`

### Free-tier models

```javascript
const model = ModelMix.new({ mix: { openrouter: false } })
    .gptOss()
    .kimiK25()
    .hermes3()
    .addText("What is the capital of France?");
console.log(await model.message());
```

These use providers with free quotas (Groq, Cerebras, and Together). OpenRouter is disabled because its GPT-OSS 120B route is no longer free. If one runs out of quota, ModelMix falls back to the next.

### Multi-provider routing

Some model shorthands register the same model across multiple providers for maximum resilience. Control which providers are enabled via the `mix` parameter:

```javascript
const model = ModelMix.new({
    mix: {
        openrouter: true,   // default: true
        cerebras: true,      // default: true
        groq: true,          // default: true
        together: false,     // default: false
        lambda: false,       // default: false
        minimax: false,      // default: false
        fireworks: false     // default: false
    }
}).kimiK25();
```

## Agent Usage Rules

- Check `package.json` for `modelmix` before running `npm install`.
- Use `ModelMix.new()` static factory (not `new ModelMix()`).
- Store API keys in `.env` and load with `dotenv/config` or `process.loadEnvFile()`. Never hardcode keys.
- Chain models for resilience: primary model first, fallbacks after.
- When using MCP tools or `addTool()`, set `max_history` to at least 3 — tool call/response pairs consume history slots.
- Use `.json()` for structured output instead of parsing text manually. Use descriptor objects `{ description, required, enum, default, nullable }` for richer schema control.
- Use `.message()` for simple text, `.raw()` when you need tokens/thinking/toolCalls.
- For Anthropic thinking, use unified `effort` (`-1` or `0`–`100`) via `config.effort` or `.effort(n)` — e.g. `.effort(100).opus50()`. Never put `effort` in `options`. Native fields win if already set.
- Templates use EJS syntax in both system prompts and user messages; prefer `<%- key %>` for raw prompt data.
- The library uses CommonJS internally but supports ESM import via `{ ModelMix }`.
- GPT-5+ models automatically use `max_completion_tokens` instead of `max_tokens`.
- o-series models (o3, o4mini) automatically strip `max_tokens` and `temperature` since those APIs don't support them.
- Anthropic Opus 4.7+ / Claude 5 family automatically strip `temperature`, `top_p`, and `top_k` (API rejects them).
- `addText()`, `addImage()`, `addImageFromUrl()`, and `addImageFromBuffer()` accept `{ role, cache?: { breakpoint: true } }` as the second argument (default role: `"user"`). Adapters translate or omit the neutral marker by provider.

## API Quick Reference

| Method | Returns | Description |
| --- | --- | --- |
| `.addText(text, {role?, cache?})` | `this` | Add user message |
| `.addTextFromFile(path, {role?, cache?})` | `this` | Add user message from file |
| `.setSystem(text)` | `this` | Set system prompt |
| `.setSystemFromFile(path)` | `this` | Set system prompt from file |
| `.addImage(path, {role?, cache?})` | `this` | Add image from file |
| `.addImageFromUrl(url, {role?, cache?})` | `this` | Add image from URL or data URI |
| `.addImageFromBuffer(buffer, {role?, cache?})` | `this` | Add image from Buffer |
| `.assign({})` | `this` | Assign EJS template data |
| `.assignKey(key, value)` | `this` | Assign one EJS template-data value |
| `.assignKeyFromFile(key, path)` | `this` | Assign the rendered output of an EJS file to one key |
| `.message()` | `Promise<string>` | Get text response |
| `.json(example, desc?, opts?)` | `Promise<object\|array>` | Get structured JSON |
| `.raw()` | `Promise<{message, think, toolCalls, tokens, response}>` | Full response |
| `.lastRaw` | `object \| null` | Full response from last call |
| `.stream(callback)` | `Promise` | Stream response |
| `.block({addSystemExtra?})` | `Promise<string>` | Extract code block from response |
| `.addMCP(package)` | `Promise` | Add MCP server tools |
| `.addTool(def, callback)` | `this` | Register custom local tool |
| `.addTools([{tool, callback}])` | `this` | Register multiple tools |
| `.removeTool(name)` | `this` | Remove a tool |
| `.listTools()` | `{local, mcp}` | List registered tools |
| `.use(plugin)` | `this` | Register instance-scoped execution middleware |
| `.new()` | `ModelMix` | Clone instance sharing models |
| `.attach(key, provider)` | `this` | Attach custom provider |

## Available Provider Classes

`ModerationMix` `MixModeration` `MixOpenAI` `MixOpenAIResponses` `MixOpenAIModeration` `MixAnthropic` `MixGoogle` `MixPerplexity` `MixGroq` `MixTogether` `MixGrok` `MixOpenRouter` `MixOllama` `MixLMStudio` `MixCustom` `MixCerebras` `MixFireworks` `MixKimi` `MixMiniMax` `MixLambda`

## Troubleshooting

**Model fails with "API key not found"**
The provider's API key env var is not set. Add it to `.env` and ensure it loads before ModelMix runs. Each provider looks for its standard env var (e.g. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`).

**Tool calls not working**
Set `max_history` to at least 3. Tool call/response pairs are stored in history and the model needs to see them to complete the conversation loop.

**JSON response parsing fails**
Add `{ addNote: true }` to the `json()` options — this injects instructions about JSON escaping that prevent common parsing errors. For complex schemas, also try `{ addExample: true }`.

**Model returns empty or truncated response**
Increase `max_tokens` in options. Default is 8192 but some tasks need more. For GPT-5+ models, `max_completion_tokens` is used automatically.

**Rate limit errors**
Configure Bottleneck: `config: { bottleneck: { maxConcurrent: 2, minTime: 2000 } }`. This throttles requests to stay within provider limits.

**MCP server fails to connect**
Ensure the MCP package is installed (`npm install @modelcontextprotocol/server-brave-search`) and required env vars are set. Call `addMCP()` with `await` — it's async.

## References

- [GitHub Repository](https://github.com/clasen/ModelMix)
