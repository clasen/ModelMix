---
name: modelmix
description: Instructions for using the ModelMix Node.js library to interact with multiple AI LLM providers through a unified interface. Use when writing code that calls AI models (OpenAI, Anthropic, Google, Groq, Perplexity, Grok, MiniMax, Fireworks, Together, Lambda, Cerebras, OpenRouter, Ollama, LM Studio), chaining models with fallback, getting structured JSON from LLMs, adding MCP tools, streaming responses, managing multi-provider AI workflows, round-robin load balancing, or rate limiting API requests in Node.js. Also use when the user mentions "modelmix", "ModelMix", asks to "call an LLM", "query a model", "add AI to my app", or wants to integrate any supported provider.
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
- [Get a text response](#get-a-text-response)
- [Get structured JSON](#get-structured-json)
- [Stream a response](#stream-a-response)
- [Extract a code block](#extract-a-code-block)
- [Get raw response (tokens, thinking, tool calls)](#get-raw-response)
- [Access full response with lastRaw](#access-full-response-with-lastraw)
- [Add images](#add-images)
- [Templates with placeholders](#templates-with-placeholders)
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
        roundRobin: false  // false=fallback, true=rotate models
    }
});
```

### Attaching Models

Chain shorthand methods to attach providers. First model is primary; others are fallbacks (or rotated if `roundRobin: true`):

```javascript
const model = ModelMix.new()
    .sonnet46()        // primary
    .gpt52()           // fallback 1
    .gemini3flash()    // fallback 2
    .addText("Hello!")
```

If `sonnet46` fails, it automatically tries `gpt52`, then `gemini3flash`.

## Available Model Shorthands

### OpenAI
`gpt52()` `gpt52chat()` `gpt51()` `gpt5()` `gpt5mini()` `gpt5nano()` `gpt45()` `gpt41()` `gpt41mini()` `gpt41nano()` `o3()` `o4mini()`

### Anthropic
`opus46()` `opus45()` `opus41()` `sonnet46()` `sonnet45()` `sonnet4()` `sonnet37()` `haiku45()` `haiku35()`

Thinking variants: append `think` — e.g. `opus46think()` `sonnet46think()` `sonnet45think()` `sonnet4think()` `sonnet37think()` `opus45think()` `opus41think()` `haiku45think()`

### Google
`gemini3pro()` `gemini3flash()` `gemini25pro()` `gemini25flash()`

### Grok
`grok4()` `grok41()` `grok41think()` `grok3()` `grok3mini()`

### Perplexity
`sonar()` `sonarPro()`

### Groq
`scout()` `maverick()`

### Together
`qwen3()` `kimiK2()` `kimiK2think()` `kimiK25think()` `gptOss()`

### MiniMax
`minimaxM25()` `minimaxM21()` `minimaxM2()` `minimaxM2Stable()`

### Fireworks
`deepseekV32()` `GLM5()` `GLM47()`

### Cerebras
`GLM46()`

### OpenRouter
`GLM45()`

### Multi-provider (auto-fallback across free/paid tiers)
`deepseekR1()` `hermes3()` `scout()` `maverick()` `kimiK2()` `GLM47()`

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

Descriptor properties: `description` (string), `required` (boolean, default true — if false, field becomes nullable), `enum` (array — if includes null, type auto-becomes nullable), `default` (any).

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
    .sonnet45think()
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
// { input: 122, output: 86, total: 541, cost: 0.000319, speed: 38 }
console.log(model.lastRaw.think);    // reasoning content (if available)
console.log(model.lastRaw.response); // raw API response
```

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

### Templates with placeholders

```javascript
const model = ModelMix.new().gpt5mini();
model.setSystemFromFile('./prompts/system.md');
model.addTextFromFile('./prompts/task.md');
model.replace({
    '{role}': 'data analyst',
    '{language}': 'Spanish'
});
model.replaceKeyFromFile('{code}', './src/utils.js');
console.log(await model.message());
```

### Round-robin load balancing

```javascript
const pool = ModelMix.new({ config: { roundRobin: true } })
    .gpt5mini()
    .sonnet45()
    .gemini3flash();

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
const model = ModelMix.new()
    .gptOss()
    .kimiK2()
    .deepseekR1()
    .hermes3()
    .addText("What is the capital of France?");
console.log(await model.message());
```

These use providers with free quotas (OpenRouter, Groq, Cerebras). If one runs out of quota, ModelMix falls back to the next.

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
}).deepseekR1();
```

## Agent Usage Rules

- Check `package.json` for `modelmix` before running `npm install`.
- Use `ModelMix.new()` static factory (not `new ModelMix()`).
- Store API keys in `.env` and load with `dotenv/config` or `process.loadEnvFile()`. Never hardcode keys.
- Chain models for resilience: primary model first, fallbacks after.
- When using MCP tools or `addTool()`, set `max_history` to at least 3 — tool call/response pairs consume history slots.
- Use `.json()` for structured output instead of parsing text manually. Use descriptor objects `{ description, required, enum, default }` for richer schema control.
- Use `.message()` for simple text, `.raw()` when you need tokens/thinking/toolCalls.
- For thinking models, append `think` to the method name (e.g. `sonnet45think()`).
- Template placeholders use `{key}` syntax in both system prompts and user messages.
- The library uses CommonJS internally but supports ESM import via `{ ModelMix }`.
- GPT-5+ models automatically use `max_completion_tokens` instead of `max_tokens`.
- o-series models (o3, o4mini) automatically strip `max_tokens` and `temperature` since those APIs don't support them.
- `addText()`, `addImage()`, `addImageFromUrl()`, and `addImageFromBuffer()` all accept `{ role }` as second argument (default `"user"`).

## API Quick Reference

| Method | Returns | Description |
| --- | --- | --- |
| `.addText(text, {role?})` | `this` | Add user message |
| `.addTextFromFile(path, {role?})` | `this` | Add user message from file |
| `.setSystem(text)` | `this` | Set system prompt |
| `.setSystemFromFile(path)` | `this` | Set system prompt from file |
| `.addImage(path, {role?})` | `this` | Add image from file |
| `.addImageFromUrl(url, {role?})` | `this` | Add image from URL or data URI |
| `.addImageFromBuffer(buffer, {role?})` | `this` | Add image from Buffer |
| `.replace({})` | `this` | Set placeholder replacements |
| `.replaceKeyFromFile(key, path)` | `this` | Replace placeholder with file content |
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
| `.new()` | `ModelMix` | Clone instance sharing models |
| `.attach(key, provider)` | `this` | Attach custom provider |

## Available Provider Classes

`MixOpenAI` `MixAnthropic` `MixGoogle` `MixPerplexity` `MixGroq` `MixTogether` `MixGrok` `MixOpenRouter` `MixOllama` `MixLMStudio` `MixCustom` `MixCerebras` `MixFireworks` `MixMiniMax` `MixLambda`

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
