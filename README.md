# 🧬 ModelMix: Reliable interface with automatic fallback for AI LLMs

**ModelMix** is a versatile module that enables seamless integration of various language models from different providers through a unified interface. With ModelMix, you can effortlessly manage and utilize multiple AI models while controlling request rates to avoid provider restrictions. The module also supports the Model Context Protocol (MCP), allowing you to enhance your models with powerful capabilities like web search, code execution, and custom functions.

Ever found yourself wanting to integrate AI models into your projects but worried about reliability? ModelMix helps you build resilient AI applications by chaining multiple models together. If one model fails, it automatically switches to the next one, ensuring your application keeps running smoothly.

## 📑 Table of Contents

- [Features](#-features)
- [Usage](#-usage)
- [Shorthand Methods](#-shorthand-methods)
- [Unified Effort Scale](#-unified-effort-scale)
- [Templates](#-templates)
- [JSON Structured Output](#-json-structured-output)
- [Token Usage Tracking](#-token-usage-tracking)
- [Prompt Caching](#-prompt-caching)
- [Model Context Protocol (MCP) Integration](#-model-context-protocol-mcp-integration)
- [Retry (Opt-In)](#-retry-optin)
- [Bottleneck Integration](#-bottleneck-integration)
- [Enabling Debug Mode](#-enabling-debug-mode)
- [Instance Plugins](#-instance-plugins)
- [ModelMix Class Overview](#-modelmix-class-overview)
- [Contributing](#-contributing)
- [License](#-license)

## ✨ Features

- **Unified Interface**: Interact with multiple AI models through a single, coherent API.
- **Request Rate Control**: Manage the rate of requests to adhere to provider limitations using Bottleneck.
- **Flexible Integration**: Easily integrate popular models like OpenAI, Anthropic, Gemini, Perplexity, Groq, Together AI, Lambda, OpenRouter, Ollama, LM Studio or custom models.
- **History Tracking**: Automatically logs the conversation history with model responses, allowing you to limit the number of historical messages with `max_history`.
- **Model Fallbacks**: Automatically try different models if one fails or is unavailable.
- **Round Robin Load Balancing**: Rotate through multiple models on each request to distribute load and maximize free tier quotas.
- **Chain Multiple Models**: Create powerful chains of models that work together, with automatic fallback if one fails.
- **Model Context Protocol (MCP) Support**: Seamlessly integrate external tools and capabilities like web search, code execution, or custom functions through the Model Context Protocol standard.

## 🛠️ Usage

1. **Install the ModelMix package:**
```bash
npm install modelmix
```
> **AI Skill**: You can also add ModelMix as a skill for AI agentic development:
> ```bash
> npx skills add https://github.com/clasen/ModelMix --skill modelmix
> ```

2. **Setup your environment variables (.env file)**:
Only the API keys you plan to use are required.
```plaintext
ANTHROPIC_API_KEY="sk-ant-..."
OPENAI_API_KEY="sk-proj-..."
OPENROUTER_API_KEY="sk-or-..."
MOONSHOT_API_KEY="your-moonshot-key..."
MINIMAX_API_KEY="your-minimax-key..."
NVIDIA_API_KEY="nvapi-..."
...
GEMINI_API_KEY="AIza..."
```

For environment variables, use `dotenv` or Node's built-in `process.loadEnvFile()`.

3. **Create and configure your models**:

```javascript
import { ModelMix } from 'modelmix';
try { process.loadEnvFile(); } catch {}

// Get structured JSON responses
const model = ModelMix.new()
    .opus5() // Anthropic claude-opus-5
    .addText("Name and capital of 3 South American countries.");

const outputExample = { countries: [{ name: "", capital: "" }] };
console.log(await model.json(outputExample));
```

**Chain multiple models with automatic fallback**

```javascript
const setup = {
    config: {
        system: "You are ALF, if they ask your name, respond with 'ALF'.",
        debug: 2
    }
};

const model = await ModelMix.new(setup)
    .sonnet5() // (main model) Anthropic claude-sonnet-5
    .gpt56luna() // (fallback 2) OpenAI gpt-5.6-luna
    .gemini37flash() // (fallback 3) Google gemini-3.7-flash
    .grok46() // (fallback 4) Grok grok-4.6
    .addText("What's your name?");

console.log(await model.message());
```

The same ordered chain can be attached by passing model shortcuts directly to
`chain()`. Add `@effort` to override unified effort for one model; entries
without it inherit the chain effort, or use the provider default when the chain
has no configured effort:

```javascript
const model = ModelMix.new(setup)
    .chain('sonnet5', 'gpt56luna@20', 'gemini37flash@-1')
    .addText("What's your name?");

console.log(await model.message());
```

**Use Perplexity to get the price of ETH**
```javascript
const ETH = ModelMix.new()
  .sonar() // Perplexity sonar
  .addText('How much is ETH trading in USD?')
  .json({ price: 1000.1 });
console.log(ETH.price);
```

**This example uses providers with free quotas (OpenRouter, Groq, Cerebras) - just get the API key and you're ready to go. If one model runs out of quota, ModelMix automatically falls back to the next model in the chain.**
```javascript
ModelMix.new()
  .gptOss()
  .kimiK25()
  .hermes3()
  .addText('What is the capital of France?');
```

This pattern allows you to:
- Chain multiple models together
- Automatically fall back to the next model if one fails
- Get structured JSON responses when needed
- Track token usage across all providers
- Keep your code clean and maintainable

## ⚡️ Shorthand Methods

ModelMix provides convenient shorthand methods for quickly accessing different AI models.

| Method | Provider | Model | Input / 1M | Output / 1M |
| --- | --- | --- | ---: | ---: |
| `gpt56sol()` | OpenAI | gpt-5.6-sol | [\$5.00][1] | [\$30.00][1] |
| `gpt56terra()` | OpenAI | gpt-5.6-terra | [\$2.00][1] | [\$12.00][1] |
| `gpt56luna()` | OpenAI | gpt-5.6-luna | [\$0.20][1] | [\$1.20][1] |
| `gpt55()` | OpenAI | gpt-5.5 | [\$5.00][1] | [\$30.00][1] |
| `gpt54()` | OpenAI | gpt-5.4 | [\$2.50][1] | [\$15.00][1] |
| `gpt54mini()` | OpenAI | gpt-5.4-mini | [\$0.75][1] | [\$4.50][1] |
| `gpt54nano()` | OpenAI | gpt-5.4-nano | [\$0.20][1] | [\$1.25][1] |
| `gpt53codex()` | OpenAI | gpt-5.3-codex | [\$1.25][1] | [\$14.00][1] |
| `gpt52()` | OpenAI | gpt-5.2 | [\$1.75][1] | [\$14.00][1] |
| `gpt51()` | OpenAI | gpt-5.1 | [\$1.25][1] | [\$10.00][1] |
| `gpt5mini()` | OpenAI | gpt-5-mini | [\$0.25][1] | [\$2.00][1] |
| `gpt5nano()` | OpenAI | gpt-5-nano | [\$0.05][1] | [\$0.40][1] |
| `gptOss()` | Together | gpt-oss-120B | [\$0.15][7] | [\$0.60][7] |
| `fable5()` | Anthropic | claude-fable-5 | [\$10.00][2] | [\$50.00][2] |
| `opus5()` | Anthropic | claude-opus-5 | [\$5.00][2] | [\$25.00][2] |
| `opus48()` | Anthropic | claude-opus-4-8 | [\$5.00][2] | [\$25.00][2] |
| `opus47()` | Anthropic | claude-opus-4-7 | [\$5.00][2] | [\$25.00][2] |
| `opus46()` | Anthropic | claude-opus-4-6 | [\$5.00][2] | [\$25.00][2] |
| `sonnet5()` | Anthropic | claude-sonnet-5 | [\$3.00][2] | [\$15.00][2] |
| `sonnet46()` | Anthropic | claude-sonnet-4-6 | [\$3.00][2] | [\$15.00][2] |
| `haiku45()` | Anthropic | claude-haiku-4-5-20251001 | [\$1.00][2] | [\$5.00][2] |
| `gemini31pro()` | Google | gemini-3.1-pro-preview | [\$2.00][3] | [\$12.00][3] |
| `gemini37flash()` | Google | gemini-3.7-flash | [\$0.75][3] | [\$3.75][3] |
| `gemini36flash()` | Google | gemini-3.6-flash | [\$0.75][3] | [\$3.75][3] |
| `gemini35flash()` | Google | gemini-3.5-flash | [\$0.75][3] | [\$4.50][3] |
| `gemini35flashLite()` | Google | gemini-3.5-flash-lite | [\$0.30][3] | [\$2.50][3] |
| `gemini31flashLite()` | Google | gemini-3.1-flash-lite-preview | [\$0.25][3] | [\$1.50][3] |
| `grok46()` | Grok | grok-4.6 | [\$2.00][6] | [\$6.00][6] |
| `grok45()` | Grok | grok-4.5 | [\$2.00][6] | [\$6.00][6] |
| `grok43()` | Grok | grok-4.3 | [\$1.25][6] | [\$2.50][6] |
| `grok420multiAgent()` | Grok | grok-4.20-multi-agent-0309 | [\$1.25][6] | [\$2.50][6] |
| `grok420()` | Grok | grok-4.20-0309 (†) | [\$1.25][6] | [\$2.50][6] |
| `qwen35397b()` | OpenRouter | qwen/qwen3.5-397b-a17b | [\$0.385][14] | [\$2.45][14] |
| `qwen36plus()` | Fireworks | qwen3p6-plus | [\$0.50][10] | [\$3.00][10] |
| `qwen37plus()` | Fireworks | models/qwen3p7-plus | [\$0.40][10] | [\$1.60][10] |
| `qwen38max()` | Fireworks | qwen3p8-2p4t-a95b | [\$2.00][10] | [\$6.00][10] |
| `deepseekV4Flash()` | Fireworks | models/deepseek-v4-flash | [\$0.14][10] | [\$0.28][10] |
| `deepseekV4Pro()` | Fireworks | models/deepseek-v4-pro-0813 | [\$1.32][12] | [\$3.96][12] |
| `GLM52()` | Together | zai-org/GLM-5.2 | [\$1.40][7] | [\$4.40][7] |
| `GLM51()` | Fireworks | models/glm-5p1 | [\$1.05][10] | [\$3.50][10] |
| `minimaxM3()` | MiniMax | MiniMax-M3 | [\$0.30][9] | [\$1.20][9] |
| `minimaxM27()` | MiniMax | MiniMax-M2.7 | [\$0.30][9] | [\$1.20][9] |
| `sonar()` | Perplexity | sonar | [\$1.00][4] | [\$1.00][4] |
| `sonarPro()` | Perplexity | sonar-pro | [\$3.00][4] | [\$15.00][4] |
| `hermes470b()` | OpenRouter | nousresearch/hermes-4-70b | [\$0.13][13] | [\$0.40][13] |
| `hermes4405b()` | OpenRouter | nousresearch/hermes-4-405b | [\$1.00][13] | [\$3.00][13] |
| `hermes3()` | Lambda | Hermes-3-Llama-3.1-405B-FP8 | [\$0.80][8] | [\$0.80][8] |
| `kimiK3()` | Moonshot | kimi-k3 | [\$3.00][11] | [\$15.00][11] |
| `kimiK25()` | Together | Kimi-K2.5 | [\$0.50][7] | [\$2.80][7] |
| `kimiK26()` | Fireworks | models/kimi-k2p6 | [\$0.95][10] | [\$4.00][10] |

Gemini 3.7 Flash and 3.6 Flash use Google's introductory standard pricing through December 31, 2026; standard rates double on January 1, 2027.

[1]: https://platform.openai.com/docs/pricing "Pricing | OpenAI"
[2]: https://docs.anthropic.com/en/docs/about-claude/pricing "Pricing - Anthropic"
[3]: https://ai.google.dev/gemini-api/docs/pricing "Google AI for Developers"
[4]: https://docs.perplexity.ai/guides/pricing "Pricing - Perplexity"
[5]: https://groq.com/pricing/ "Groq Pricing"
[6]: https://docs.x.ai/docs/models "xAI"
[7]: https://www.together.ai/pricing "Together AI"
[8]: https://lambda.ai/inference "Lambda Pricing"
[9]: https://platform.minimax.io/docs/api-reference/anthropic-api-compatible-cache#supported-models-and-pricing "MiniMax Pricing"
[10]: https://fireworks.ai/pricing#serverless-pricing "Fireworks Pricing"
[11]: https://platform.kimi.ai/docs/guide/kimi-k3-pricing "Kimi K3 Pricing"
[12]: https://fireworks.ai/models/deepseek-ai/deepseek-v4-pro-0813 "DeepSeek V4 Pro 0813 Pricing"
[13]: https://openrouter.ai/nousresearch "Nous Research Models on OpenRouter"
[14]: https://openrouter.ai/qwen/qwen3.5-397b-a17b "Qwen3.5 397B A17B on OpenRouter"

Each method accepts optional `options`, `config`, and (for multi-provider methods) `mix` parameters to customize behavior.  

```javascript
const result = await ModelMix.new({ 
        options: { temperature: 0.7 },
        config: { system: "You are a helpful assistant" }
    })
    .gpt56luna()
    .addText("Tell me a story about a cat");
    .message();
```

## 🎛️ Unified Effort Scale

Control reasoning depth with one ModelMix policy value (`-1` adaptive, or `0`–`100`). It lives **outside** native `options` and is mapped to each provider’s effort API at request time.

```javascript
// In config (ModelMix.new or per-model shorthand)
ModelMix.new({ config: { effort: 50 } }).opus5().addText('...').message();
ModelMix.new().deepseekV4Flash({ config: { effort: 100 } }).addText('...').message();

// Fluent
ModelMix.new().effort(-1).minimaxM3().addText('...').message();
```

**Native wins:** if you already set a provider-native field (`reasoning_effort`, `output_config.effort`, `thinkingConfig`, etc.), unified `effort` is ignored for that request.

| | 0–19 | 20–39 | 40–59 | 60–79 | 80–100 | `-1` |
|--|------|-------|-------|-------|--------|------|
| OpenAI | `none` | `low` | `medium` | `high` | `xhigh` | — |
| Anthropic | `low` | `medium` | `high` | `xhigh` | `max` | adaptive |
| Gemini 3+ | `minimal` | `low` | `medium` | `high` | — | dynamic |
| DeepSeek V4 | off | `low`↑ | `high`↑ | `high`↑ | `max`↑ | — |
| MiniMax M3 | off | adaptive | adaptive | adaptive | adaptive | adaptive |

### Provider-specific behavior

- **Gemini:** Gemini 3+ uses bands 0–24 / 25–49 / 50–74 / 75–100. Gemini 3.7 Flash clamps these bands to `low` / `low` / `medium` / `high`; `-1` leaves its native `medium` default unchanged. Gemini 2.5 maps 0–100 to `thinkingBudget`.
- **DeepSeek:** `↑` means thinking is enabled; `off` means it is disabled.
- **MiniMax:** `off` maps to `thinking.disabled`; `adaptive` maps to `thinking.type=adaptive`.
- **Anthropic:** Claude 5, Fable, Opus 4.6+, and Sonnet 4.6+ use adaptive thinking with `output_config.effort`. Sonnet 4.5 and Haiku 4.5 use `thinking.type=enabled` with `budget_tokens`.
- **Grok 4.6:** 0–39 / 40–59 / 60–79 / 80–100 map to `low` / `medium` / `high` / `xhigh`. Without effort, Grok uses its native `high` default.

`-1` uses the provider's adaptive or dynamic mode when available; otherwise it is a no-op. Effort levels are clamped to each model's supported range.

### Migrating from thinking shorthands

The former `*think()` methods were removed. Use `.effort(n).<model>()` with `0`–`100` or `-1` instead.

- **Kimi:** use `kimiK25()` or `kimiK26()`.
- **Grok 4.20:** `.grok420()` selects the non-reasoning model. Use `.effort(20+).grok420()` or `.effort(-1).grok420()` to select the reasoning model.

## 🔄 Templates

ModelMix renders system prompts and user messages with [EJS](https://ejs.co/). Templates can be inline or stored in external files, and support variables, conditionals, loops, and relative includes.

Templates are executable JavaScript and must be controlled by the developer. Pass untrusted content only as template data, never as the template source.

### Core methods

| Method | Description |
| --- | --- |
| `setSystemFromFile(path)` | Load the system prompt from a file |
| `addTextFromFile(path)` | Load a user message from a file |
| `assign({ key: value })` | Assign EJS template data |
| `assignKey(key, value)` | Assign one EJS template-data value |
| `assignKeyFromFile(key, path)` | Assign an EJS-rendered file to one template-data key |

### Basic example with `assign`

```javascript
const gpt = ModelMix.new().gpt52();

gpt.addText('Write a short story about a <%- animal %> that lives in <%- place %>.');
gpt.assign({ animal: 'cat', place: 'a haunted castle' });

console.log(await gpt.message());
```

Use `assignKey()` when assigning a single value:

```javascript
gpt.assignKey('animal', 'cat');
```

### Loading prompts from `.md` files

Instead of writing long prompts inline, keep them in separate Markdown files. This makes them easier to read, edit, and version control.

**`prompts/system.md`**
```markdown
You are <%- role %>, an expert in <%- topic %>.
Always respond in <%- language %>.
```

**`prompts/task.md`**
```markdown
Analyze the following and provide 3 key insights:

<%- content %>
```

**`app.js`**
```javascript
const gpt = ModelMix.new().gpt56luna();

gpt.setSystemFromFile('./prompts/system.md');
gpt.addTextFromFile('./prompts/task.md');

gpt.assign({
    role: 'a senior analyst',
    topic: 'market trends',
    language: 'Spanish',
    content: 'Bitcoin surpassed $100,000 in December 2024...'
});

console.log(await gpt.message());
```

### Simple includes

Use EJS `include` to compose a prompt from other files. Include paths are resolved relative to the template containing them.

```ejs
<%- include('shared/rules.md') %>
```

For example:

**`prompts/task.md`**
```markdown
Analyze the request following these rules:

<%- include('shared/rules.md') %>
```

**`prompts/shared/rules.md`**
```markdown
- Be concise
- Explain assumptions
```

### Dynamic includes

When the file changes at runtime, pass its path as template data and call `include` with that variable. This replaces the file-injection use case while keeping composition inside the template.

**`prompts/summarize.md`**
```markdown
Summarize the following article in 3 bullet points:

<%- include(articleFile) %>
```

**`app.js`**
```javascript
const gpt = ModelMix.new().gpt5mini();

gpt.addTextFromFile('./prompts/summarize.md');
gpt.assign({ articleFile: '../data/article.md' });

console.log(await gpt.message());
```

Static and dynamic include paths are resolved relative to the containing template. Included files are EJS template source, so both the path and file must be controlled by the developer. Pass untrusted runtime content through ordinary `assign()` values instead of using it as an include path.

### Assigning a rendered file to a key

Use `assignKeyFromFile()` when the outer template needs the rendered contents of a file as one data value:

```javascript
const gpt = ModelMix.new().gpt5mini();

gpt.assign({ language: 'Spanish' });
gpt.assignKeyFromFile('rules', './prompts/rules.md');
gpt.addText('Follow these rules:\n<%- rules %>');

console.log(await gpt.message());
```

`assignKeyFromFile()` uses EJS `include` internally. The assigned file can access ordinary `assign()` data and use includes relative to its own path. It is rendered once per request and reused across the system prompt and messages in that request. The file is template source and must be developer-controlled.

### Full template workflow

Combine all methods to build reusable, file-based prompt pipelines:

**`prompts/system.md`**
```markdown
You are <%- role %>. Follow these rules:
<%- include('partials/rules.md') %>
- Respond in <%- language %>
```

**`prompts/partials/rules.md`**
```markdown
- Be concise
- Use examples when possible
```

**`prompts/review.md`**
```markdown
Review the following code and suggest improvements:

<%- include('../src/utils.js') %>
```

**`app.js`**
```javascript
const gpt = ModelMix.new().gpt5mini();

gpt.setSystemFromFile('./prompts/system.md');
gpt.addTextFromFile('./prompts/review.md');

gpt.assign({ role: 'a senior code reviewer', language: 'English' });

console.log(await gpt.message());
```

### EJS output and control flow

Use `<%- value %>` for raw prompt content and `<%= value %>` only when XML escaping is intentional. Missing variables and missing files throw immediately.

```ejs
<% if (user.active) { %>
Review these roles:
<% user.roles.forEach(role => { %>
- <%- role %>
<% }) %>
<% } %>
```

### Random prompt choices

Use a `choice` block to include exactly one prompt variant. When no weights are present, every option has the same probability:

```ejs
<% choice %>
<% option %>
Use emojis.
<% option %>
Use few emojis.
<% option %>
Do not use emojis.
<% /choice %>
```

Add a positive weight after every `option` when the probabilities should differ:

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

Weights are relative and do not need to total 100. A block must either give every option a weight or omit all weights. Directives must be on their own lines; choices can be nested and can also appear inside relative includes. Each new request makes a new selection, while retries, provider fallbacks, and tool continuations keep the original selection.

### Recursive includes

An included template can include itself to render recursive data. Always define a stopping condition:

```ejs
<%- node.text %>

<% if (node.children?.length && depth < maxDepth) { %>
<% for (const child of node.children) { %>
<%- include('tree.ejs', { node: child, depth: depth + 1, maxDepth }) %>
<% } %>
<% } %>
```

```javascript
const gpt = ModelMix.new().gpt5mini();

gpt.addTextFromFile('./prompts/tree.ejs');
gpt.assign({ node: promptTree, depth: 0, maxDepth: 10 });

console.log(await gpt.message());
```

Content supplied through `assign()` remains data. EJS tags inside that content are not executed recursively; use `assignKeyFromFile()` only for developer-controlled EJS files that should be rendered.

## 🧩 JSON Structured Output

The `json` method forces the model to return a structured JSON response. You define the shape with an example object and optionally describe each field.

```javascript
await model.json(schemaExample, schemaDescription, options)
```

### Basic usage

```javascript
const model = ModelMix.new()
    .gpt56luna()
    .addText('Name and capital of 3 South American countries.');

const result = await model.json({ countries: [{ name: "", capital: "" }] });
console.log(result);
// { countries: [{ name: "Argentina", capital: "Buenos Aires" }, ...] }
```

### Adding field descriptions

The second argument lets you describe each field so the model understands exactly what you expect. Descriptions can be **strings** (simple) or **descriptor objects** (with metadata):

```javascript
const result = await model.json(
    { countries: [{ name: "Argentina", capital: "BUENOS AIRES" }] },
    { countries: [{ name: "name of the country", capital: "capital of the country in uppercase" }] },
    { addNote: true }
);
// { countries: [
//   { name: "Brazil", capital: "BRASILIA" },
//   { name: "Colombia", capital: "BOGOTA" },
//   { name: "Chile", capital: "SANTIAGO" }
// ]}
```

### Enhanced descriptors

Descriptions support **descriptor objects** with `description`, `required`, `enum`, `default`, and `nullable`:

```javascript
const result = await model.json(
    { name: 'Martin', age: 22, sex: 'male' },
    {
        name: { description: 'Name of the actor', required: false },
        age: 'Age of the actor', // string still works
        sex: { description: 'Gender', enum: ['male', 'female', null], default: null }
    }
);
```

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `description` | `string` | — | Field description for the model |
| `required` | `boolean` | `true` | If `false`, field is removed from `required` and its type becomes nullable |
| `enum` | `array` | — | Restricts the field to specific values. Including `null` in the array auto-makes the type nullable |
| `default` | `any` | — | Default value hint for the model |
| `nullable` | `boolean` | `false` | If `true`, makes the type nullable without removing from `required` |

You can mix plain strings and descriptor objects freely in the same descriptions parameter:

```javascript
const result = await model.json(
    { name: 'Martin', age: 22, status: 'active' },
    {
        name: 'Full name',                                            // plain string
        age: { description: 'Age in years', required: false },        // optional field
        status: { description: 'Account status', enum: ['active', 'inactive', 'banned'], default: 'active' }
    }
);
```

### Nested object descriptions

Pass a nested object as the description value to describe fields inside a nested object:

```javascript
const result = await model.json(
    { user: { name: 'Alice', age: 30 } },
    {
        user: { name: 'Full name of the user', age: 'Age in years' }
    }
);
```

To describe the object field itself (e.g. mark it optional) **and** its nested fields, use the `description` / `required` descriptor for the parent key, which applies only to the parent, while still passing nested descriptions as its own separate key:

```javascript
// Mark the parent optional but don't describe its children
const result = await model.json(
    { user: { name: 'Alice', age: 30 } },
    { user: { description: 'User details', required: false } }
);
```

### Array item descriptions

Pass descriptions for the items of an array by wrapping the descriptions in an array:

```javascript
const result = await model.json(
    { countries: [{ name: 'France', capital: 'Paris' }] },
    { countries: [{ name: 'Country name', capital: 'Capital city in uppercase' }] }
);
```

To mark the array field itself optional while keeping item descriptions, use a descriptor on the key:

```javascript
const result = await model.json(
    { tags: ['admin'] },
    { tags: { description: 'List of user roles', required: false } }
);
```

### Automatic type and format detection

`generateJsonSchema` infers types and formats automatically from the example values:

| Example value | Inferred schema |
| --- | --- |
| `42` | `{ type: 'integer' }` |
| `19.99` | `{ type: 'number' }` |
| `true` / `false` | `{ type: 'boolean' }` |
| `null` | `{ type: 'null' }` |
| `'hello'` | `{ type: 'string' }` |
| `'user@example.com'` | `{ type: 'string', format: 'email' }` |
| `'1990-01-01'` | `{ type: 'string', format: 'date', description: 'Date in format YYYY-MM-DD' }` |
| `'14:30'` | `{ type: 'string', format: 'time', description: 'Time in format HH:MM' }` |
| `'09:15:45'` | `{ type: 'string', format: 'time', description: 'Time in format HH:MM:SS' }` |
| `[{ … }]` | `{ type: 'array', items: { … } }` — schema inferred from the first element |
| `{ … }` | `{ type: 'object', properties: { … }, required: […] }` |

When a field carries an `enum` that includes `null`, or has `required: false` or `nullable: true`, its type is widened to `[type, 'null']`. For example:

```javascript
// enum with null → type becomes ['string', 'null']
{ description: 'Gender', enum: ['m', 'f', null] }

// required: false → removes from required[] and type becomes ['string', 'null']
{ description: 'Nickname', required: false }

// nullable: true → type becomes ['string', 'null'] but stays in required[]
{ description: 'Middle name', nullable: true }
```

### Array auto-wrap

When you pass a top-level array as the example, ModelMix automatically wraps it for better LLM compatibility and unwraps the result transparently:

```javascript
const result = await model.json([{ name: 'martin' }]);
// result is an array: [{ name: "Martin" }, { name: "Carlos" }, ...]
```

Internally, the array is wrapped as `{ out: [...] }` so the model receives a proper object schema, then `result.out` is returned automatically.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `addSchema` | `true` | Include the generated JSON schema in the system prompt |
| `addExample` | `false` | Include the example object in the system prompt |
| `addNote` | `false` | Add a note about JSON escaping to prevent parsing errors |

```javascript
// Include the example and the escaping note
const result = await model.json(
    { name: "John", age: 30, skills: ["JavaScript"] },
    { name: "Full name", age: "Age in years", skills: "List of programming languages" },
    { addExample: true, addNote: true }
);
```

These options give you fine-grained control over how much guidance you provide to the model for generating properly formatted JSON responses.

## 📊 Token Usage Tracking

ModelMix automatically tracks token usage for all requests across different providers, providing a unified format regardless of the underlying API.

### How it works

Every response from `raw()` now includes a `tokens` object with the following structure:

```javascript
{
  tokens: {
    input: 1200,          // Total input tokens, including cache reads and writes
    output: 50,           // Number of output tokens
    thinking: 0,          // Internal reasoning tokens reported separately
    total: 1250,          // Total tokens used
    cached: 1024,         // Input tokens read from cache
    cacheWrite: 0,        // Input tokens written to cache
    cacheWrite5m: 0,      // Anthropic writes using the 5-minute TTL
    cacheWrite1h: 0,      // Anthropic writes using the 1-hour TTL
    uncachedInput: 176,   // max(0, input - cached - cacheWrite)
    cacheHitRate: 0.8533, // cached / input, rounded to 4 decimals
    cacheSavings: 0.00018432, // USD saved by cache reads
    cacheWritePremium: 0, // Extra USD paid to write this cache entry
    breakEvenHits: 0,     // Full future hits needed to recover that premium
    cost: 0.00011568,     // Total estimated cost in USD
    costBreakdown: {
      uncachedInput: 0.0000352,
      cachedInput: 0.00002048,
      cacheWrite: 0,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      output: 0.00006,
      total: 0.00011568
    },
    speed: 42             // Output tokens per second (int)
  }
}
```

### `lastRaw` — Access full response after `message()` or `json()`

After calling `message()` or `json()`, use `lastRaw` to access the complete response (tokens, thinking, tool calls, etc.). It has the same structure as `raw()`.

```javascript
const text = await model.message();
console.log(model.lastRaw.tokens);
// Same normalized token and cost structure returned by raw()
```

`thinking` contains internal reasoning tokens when a provider reports them separately; cost calculation bills them at the output rate. `cached` aggregates cache reads reported by the provider, while `cacheWrite` aggregates cache writes. Anthropic additionally exposes `cacheWrite5m` and `cacheWrite1h` because those writes cost 1.25× and 2× the normal input rate, respectively. `cacheSavings` compares cache reads with the normal input rate, `cacheWritePremium` compares writes with that rate, and `breakEvenHits` estimates how many complete future hits recover the current write premium. For Anthropic, `input` is normalized to include uncached input, cache reads, and cache writes. Missing usage or pricing categories return `0`. The `speed` field is the generation speed measured in output tokens per second (integer).

## 🧠 Prompt Caching

Prompt caching reuses the stable beginning of a prompt at the provider level. It does not cache the answer: every call still generates a new response.

For GPT-5.6, keep the long, reusable instructions first, mark the end of that stable prefix, and add the changing request afterward:

```javascript
async function ask(question) {
    const model = ModelMix.new()
        .gpt56luna({
            options: {
                prompt_cache_key: 'support-rules-v1',
                prompt_cache_options: { mode: 'explicit', ttl: '30m' }
            }
        })
        .addTextFromFile('./prompts/support.md', {
            role: 'developer',
            cache: { breakpoint: true }
        })
        .addText(question);

    const answer = await model.message();
    const { cached, cacheWrite, cacheHitRate } = model.lastRaw.tokens;
    console.log({ cached, cacheWrite, cacheHitRate });
    return answer;
}

await ask('Summarize support ticket 123.');
await ask('Summarize support ticket 456.');
```

The contents of `support.md` and the cache key stay the same between calls; only the final question changes. The first request may report `cacheWrite > 0`, while later requests confirm reuse with `cached > 0`. For GPT-5.6, the stable prefix must contain at least 1,024 tokens. Keep all variable content after the breakpoint, and change `prompt_cache_key` when the stable instructions change.

### GPT-5.6 prompt caching

GPT-5.6 supports implicit or explicit caching through `prompt_cache_options`. Put the explicit breakpoint at the end of the stable prefix; the provider only caches prompts with at least 1,024 tokens.

```javascript
const model = ModelMix.new()
  .gpt56luna({
    options: {
      prompt_cache_key: 'support-agent-v1',
      prompt_cache_options: { mode: 'explicit', ttl: '30m' }
    }
  })
  .addText(longStableInstructions, {
    cache: { breakpoint: true }
  })
  .addText('Answer this variable request.');

const result = await model.raw();
console.log(result.tokens.cached, result.tokens.cacheWrite, result.tokens.cost);
```

The provider-neutral `cache: { breakpoint: true }` option is accepted by `addTextFromFile()`, `addImage()`, `addImageFromUrl()`, and `addImageFromBuffer()`. Responses-native `input_text`, `input_image`, and `input_file` blocks preserve the native `prompt_cache_breakpoint` field when supplied directly through `options.messages`.

GPT-5.6 uses `prompt_cache_options.ttl`; `prompt_cache_retention` remains available for earlier OpenAI models. ModelMix rejects the incompatible control instead of silently dropping it. For GPT-5.6 requests over 272K input tokens, the cost calculation applies the documented 2× input and 1.5× output multipliers to the complete request, including cache reads and writes.

GPT-5.6 prices per 1M tokens:

| Model | Input | Cached input | Cache write | Output |
| --- | ---: | ---: | ---: | ---: |
| `gpt-5.6-sol` | $5.00 | $0.50 | $6.25 | $30.00 |
| `gpt-5.6-terra` | $2.00 | $0.20 | $2.50 | $12.00 |
| `gpt-5.6-luna` | $0.20 | $0.02 | $0.25 | $1.20 |

### Cross-provider cache fallback

Neutral breakpoints are translated at the last moment by each provider adapter. Native request policies remain scoped to their model, so they cannot leak into a fallback request:

```javascript
const model = ModelMix.new()
  .gpt56luna({
    options: {
      prompt_cache_key: 'support-agent-v1',
      prompt_cache_options: { mode: 'explicit', ttl: '30m' }
    }
  })
  .haiku45({
    options: {
      cache_control: { type: 'ephemeral', ttl: '1h' }
    }
  })
  .addText(longStableInstructions, { cache: { breakpoint: true } })
  .addText('Answer this variable request.');
```

GPT-5.6 receives `prompt_cache_breakpoint`; Anthropic receives `cache_control`; older OpenAI models and providers without an equivalent omit the marker. When a neutral explicit breakpoint is present for Anthropic, its model-scoped `cache_control` becomes that block's policy instead of adding an automatic breakpoint after the variable suffix.

## 🔧 Model Context Protocol (MCP) Integration

ModelMix makes it incredibly easy to enhance your AI models with powerful capabilities through the Model Context Protocol. With just a few lines of code, you can add features like web search, code execution, or any custom functionality to your models.

### Example: Adding Web Search Capability

Include the API key for Brave Search in your .env file.
```
BRAVE_API_KEY="BSA0..._fm"
```

```javascript
const mmix = ModelMix.new({ config: { max_history: 10 } }).gpt56sol();
mmix.setSystem('You are an assistant and today is ' + new Date().toISOString());

// Add web search capability through MCP
await mmix.addMCP('@modelcontextprotocol/server-brave-search');
mmix.addText('Use Internet: When did the last Christian pope die?');
console.log(await mmix.message());
```

This simple integration allows your model to:
- Search the web in real-time
- Access up-to-date information
- Combine AI reasoning with external data

The Model Context Protocol makes it easy to add any capability to your models, from web search to code execution, database queries, or custom functions. All with just a few lines of code!

## 🔁 Retry (Opt-In)

ModelMix supports optional intra-model retries for transient HTTP failures. When enabled, it retries the same provider before moving to fallback models.

```javascript
const mix = ModelMix.new({
  config: {
    retry: {
      enabled: true,                 // Default: false (opt-in)
      retries: 2,                    // Extra attempts after first try
      baseDelayMs: 500,              // Exponential backoff base delay
      maxDelayMs: 5000,              // Backoff cap
      retryableStatusCodes: [408, 425, 429, 500, 502, 503, 504, 529]
    }
  }
});
```

Behavior summary:
- If retry is disabled (default), ModelMix keeps current behavior: immediate fallback to next model on failure.
- If retry is enabled, ModelMix retries the same model only for configured transient status codes.
- After retries are exhausted (or for non-retryable errors), ModelMix continues with normal fallback chain.

## 🚦 Bottleneck Integration

ModelMix uses Bottleneck for efficient rate limiting of API requests.

```javascript
const setup = {
    config: {
        bottleneck: {
            maxConcurrent: 8,
            minTime: 500
        }
    }
};
```

Attached models share this limiter, which queues requests when capacity is exhausted.

## 🐛 Enabling Debug Mode

Set `config.debug` to `0` (silent), `1` (minimal), `2` (summary), `3` (full), or `4` (verbose raw details), then run with `DEBUG=ModelMix*`:

```javascript
const mix = ModelMix.new({ config: { debug: 4 } });
```

```bash
DEBUG=ModelMix* node your-script.js
```

## 🔌 Instance Plugins

Plugins wrap one ModelMix instance without changing global behavior. They run in registration order after templates are rendered and before provider-specific request conversion:

```javascript
const metrics = {
    name: 'metrics',
    async execute(context, next) {
        const startedAt = Date.now();
        const result = await next();
        return { ...result, elapsedMs: Date.now() - startedAt };
    }
};

const model = ModelMix.new()
    .gpt56luna()
    .use(metrics)
    .addText('Summarize this request.');
```

A plugin may edit `context.request`, call `next()`, or return a complete ModelMix result itself. It can also create history-free child executions with `context.invoke()` and choose plugin inheritance:

```javascript
const child = await context.invoke({
    systemFile: './prompts/extract-entities.md',
    assign: { outputLanguage: 'Spanish' },
    messages: [{ role: 'user', content: section }],
    plugins: { exclude: ['recursive-plugin'] },
    history: false
});
```

Supported policies are `'inherit'`, `'none'`, `{ include: [...] }`, and `{ exclude: [...] }`. Child metadata exposes `executionId`, `parentExecutionId`, and `depth` to middleware. `.new()` inherits registered plugins but not message history.

Child `systemFile` templates use the same EJS engine, `assign()` data contract, and relative Markdown includes as ordinary ModelMix templates. Use either `system` or `systemFile`, not both.

### Recursive Language Model plugin

The separately publishable `@modelmix/rlm` workspace package keeps document parsing, planner prompts, and `isolated-vm` out of the core `modelmix` dependency tree. It requires Node.js 22 or newer.

```javascript
const { ModelMix } = require('modelmix');
const { rlm } = require('@modelmix/rlm');

const fast = ModelMix.new().gpt5nano();

const result = await ModelMix.new()
    .gpt56luna()
    .use(rlm({
        maxDepth: 2,
        documents: {
            book: {
                format: 'markdown',
                content: markdownBook
            }
        },
        workers: {
            fast: {
                model: fast,
                intelligence: 2,
                cost: 1,
                speed: 4,
                description: 'Translation, extraction, and simple transformations'
            }
        },
        limits: {
            maxQueryBytes: 64 * 1024,
            sandboxMemoryBytes: 64 * 1024 * 1024,
            maxConcurrentQueries: 4,
            maxCalls: 100,
            maxOutputBytes: 8 * 1024 * 1024,
            maxGeneratedTokens: 100000,
            maxWallTimeMs: 120000
        }
    }))
    .addText('Translate this book to neutral Latin American Spanish.')
    .message();
```

Markdown headings become stable nested sections, lists expose item arrays, and the original source order remains reconstructable. The planner receives only a content-free variable manifest: paths, types, array item counts, serialized UTF-8 byte estimates, string lengths, line and paragraph counts, structural summaries, and partition hints. The document values enter only the isolated sandbox, where generated JavaScript can inspect `variables` and call registered workers through `query()`.

A worker normally supplies `model: anotherModelMixInstance`. To offer the current parent chain under a name, register it with `useParent: true` instead; defining both is rejected.

Planner instructions live in Markdown templates under `plugins/rlm/prompts/`. The plugin supplies manifests and limits through ModelMix `assign()` and loads the system prompt through `systemFile`, so relative includes work and runtime values are rendered exactly once.

## 📚 ModelMix Class Overview

```javascript
new ModelMix(args = { options: {}, config: {} })
```

- **args**: Configuration object with `options` and `config` properties.
  - **options**: This object contains default options that are applied to all models. These options can be overridden when creating a specific model instance. Examples of default options include:
    - `max_tokens`: Sets the maximum number of tokens to generate, e.g., 2000.
    - `temperature`: Controls the randomness of the model's output, e.g., 1.
    - ...(Additional default options can be added as needed)
  - **config**: This object contains configuration settings that control the behavior of the `ModelMix` instance. These settings can also be overridden for specific model instances. Examples of configuration settings include:
    - `system`: Sets the default system message for the model, e.g., "You are an assistant."
    - `max_history`: Limits the number of historical messages to retain, e.g., 1.
    - `effort`: Unified reasoning effort (`-1` adaptive, or `0`–`100`). Not a native provider field — use `config.effort` or `.effort(n)`.
    - `roundRobin`: When `true`, rotates through attached models on each request for load balancing. When `false` (default), uses fallback mode where models are tried sequentially only if previous ones fail.
    - `bottleneck`: Configures the rate limiting behavior using Bottleneck. For example:
      - `maxConcurrent`: Maximum number of concurrent requests
      - `minTime`: Minimum time between requests (in ms)
      - `reservoir`: Number of requests allowed in the reservoir period
      - `reservoirRefreshAmount`: How many requests are added when the reservoir refreshes
      - `reservoirRefreshInterval`: Reservoir refresh interval
    - `retry`: Optional intra-model retry policy before fallback:
      - `enabled`: Enables retry behavior (`false` by default)
      - `retries`: Number of retries for retryable failures
      - `baseDelayMs`: Initial backoff delay in milliseconds
      - `maxDelayMs`: Maximum backoff delay in milliseconds
      - `retryableStatusCodes`: HTTP status codes that should trigger retry
    - ...(Additional configuration parameters can be added as needed)

**Methods**

- `attach(modelKey, modelInstance)`: Attaches a model instance to the `ModelMix`.
- `new()`: `static` Creates a new `ModelMix`.
- `new()`: Creates a new `ModelMix` using instance setup.
- `effort(n)`: Sets unified effort (`-1` or `0`–`100`) on `config.effort`.

- `setSystem(text)`: Sets the system prompt.
- `setSystemFromFile(filePath)`: Sets the system prompt from a file.
- `addText(text, config = { role: "user", cache? })`: Adds a text message.
- `addTextFromFile(filePath, config = { role: "user", cache? })`: Adds a text message from a file.
- `addImage(filePath, config = { role: "user", cache? })`: Adds an image message from a file path.
- `addImageFromUrl(url, config = { role: "user", cache? })`: Adds an image message from URL.
- `assign(keyValues)`: Assigns EJS data for messages and system prompts.
- `assignKey(key, value)`: Assigns one EJS data value.
- `assignKeyFromFile(key, filePath)`: Renders an EJS file through `include` and assigns its output to one key.
- `message()`: Sends the message and returns the response.
- `raw()`: Sends the message and returns the complete response data including:
  - `message`: The text response from the model
  - `think`: Reasoning/thinking content (if available)
  - `toolCalls`: Array of tool calls made by the model (if any)
  - `tokens`: Normalized token counts (`input`, `output`, `thinking`, `total`, `cached`, `cacheWrite`, `cacheWrite5m`, `cacheWrite1h`, `uncachedInput`, `cacheHitRate`), cache economics (`cacheSavings`, `cacheWritePremium`, `breakEvenHits`), plus `cost`, `costBreakdown` (USD), and `speed` (output tokens/sec)
  - `response`: The raw API response
- `ModerationMix` owns moderation-only provider chains. Use `openai()` to attach OpenAI's current `omni-moderation-latest`; `raw()` exposes the results under `moderation` (`flagged`, `categories`, `category_scores`, and `category_applied_input_types`). It uses `/v1/moderations`, rejects generative providers, does not generate text, and does not support streaming. Future moderation providers can be appended as fallbacks.
  ```javascript
  const { ModerationMix } = require('modelmix');

  const { moderation: [profile] } = await ModerationMix.new()
      .openai()
      .addText(username)
      .addImageFromUrl(avatarUrl)
      .raw();

  if (profile.flagged) throw new Error('Profile rejected by moderation');
  ```
- `stream(callback)`: Sends the message and streams the response, invoking the callback with each streamed part.
- `json(schemaExample, descriptions = {}, options = {})`: Forces the model to return a response in a specific JSON format.
  - `schemaExample`: Example of the JSON structure to be returned. Top-level arrays are auto-wrapped for better LLM compatibility.
  - `descriptions`: Descriptions for each field — can be strings or descriptor objects with `{ description, required, enum, default }`.
  - `options`: `{ addSchema: true, addExample: false, addNote: false }`
  - Returns a Promise that resolves to the structured JSON response
  - Example:
    ```javascript
    const response = await handler.json(
      { time: '24:00:00', message: 'Hello' },
      { time: 'Time in format HH:MM:SS', message: { description: 'Greeting', required: false } }
    );
    ```
- `block({ addText = true })`: Forces the model to return a response in a specific block format.

### MixCustom Class Overview

```javascript
new MixCustom(args = { config: {}, options: {}, headers: {} })
```

- **args**: Configuration object with `config`, `options`, and `headers` properties.
  - **config**:
    - `url`: The endpoint URL to which the model sends requests.
    - `prefix`: An array of strings used as a prefix for requests.
    - ...(Additional configuration parameters can be added as needed)
  - **options**: This object contains default options that are applied to all models. These options can be overridden when creating a specific model instance. Examples of default options include:
    - `max_tokens`: Sets the maximum number of tokens to generate, e.g., 2000.
    - `temperature`: Controls the randomness of the model's output, e.g., 1.
    - `top_p`: Controls the diversity of the output, e.g., 1.
    - ...(Additional default options can be added as needed)
  - **headers**:
    - `authorization`: The authorization header, typically including a Bearer token for API access.
    - `x-api-key`: A custom header for API key if needed.
    - ...(Additional headers can be added as needed)

### MixOpenAI Class Overview

```javascript
new MixOpenAI(args = { config: {}, options: {} })
```

- **args**: Configuration object with `config` and `options` properties.
  - **config**: Specific configuration settings for OpenAI, including the `apiKey`.
  - **options**: Default options for OpenAI model instances.

### MixOpenRouter Class Overview

```javascript
new MixOpenRouter(args = { config: {}, options: {} })
```

- **args**: Configuration object with `config` and `options` properties.
  - **config**: Specific configuration settings for OpenRouter, including the `apiKey`.
  - **options**: Default options for OpenRouter model instances.

### MixAnthropic Class Overview

```javascript
new MixAnthropic(args = { config: {}, options: {} })
```

- **args**: Configuration object with `config` and `options` properties.
  - **config**: Specific configuration settings for Anthropic, including the `apiKey`.
  - **options**: Default options for Anthropic model instances.

### MixPerplexity Class Overview

```javascript
new MixPerplexity(args = { config: {}, options: {} })
```

- **args**: Configuration object with `config` and `options` properties.
  - **config**: Specific configuration settings for Perplexity, including the `apiKey`.
  - **options**: Default options for Perplexity model instances.
### MixPerplexity Class Overview

```javascript
new MixGroq(args = { config: {}, options: {} })
```

- **args**: Configuration object with `config` and `options` properties.
  - **config**: Specific configuration settings for Perplexity, including the `apiKey`.
  - **options**: Default options for Perplexity model instances.

### MixOllama Class Overview

```javascript
new MixOllama(args = { config: {}, options: {} })
```

- **args**: Configuration object with `config` and `options` properties.
  - **config**: Specific configuration settings for Ollama.
    - `url`: The endpoint URL to which the model sends requests.
  - **options**: Default options for Ollama model instances.

### MixLMStudio Class Overview

```javascript
new MixLMStudio(args = { config: {}, options: {} })
```

- **args**: Configuration object with `config` and `options` properties.
  - **config**: Specific configuration settings for Ollama.
    - `url`: The endpoint URL to which the model sends requests.
  - **options**: Default options for Ollama model instances.

### MixTogether Class Overview

```javascript
new MixTogether(args = { config: {}, options: {} })
```

- **args**: Configuration object with `config` and `options` properties.
  - **config**: Specific configuration settings for Together AI, including the `apiKey`.
  - **options**: Default options for Together AI model instances.

### MixGoogle Class Overview

```javascript
new MixGoogle(args = { config: {}, options: {} })
```

- **args**: Configuration object with `config` and `options` properties.
  - **config**: Specific configuration settings for Google Gemini, including the `apiKey`.
  - **options**: Default options for Google Gemini model instances.

## 🤝 Contributing

Contributions are welcome! If you find any issues or have suggestions for improvement, please open an issue or submit a pull request on the [GitHub repository](https://github.com/clasen/ModelMix).

## 📄 License

The MIT License (MIT)

Copyright (c) Martin Clasen

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
