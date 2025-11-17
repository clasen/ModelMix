# 🧬 ModelMix: Unified API for Diverse AI LLM

**ModelMix** is a versatile module that enables seamless integration of various language models from different providers through a unified interface. With ModelMix, you can effortlessly manage and utilize multiple AI models while controlling request rates to avoid provider restrictions. The module also supports the Model Context Protocol (MCP), allowing you to enhance your models with powerful capabilities like web search, code execution, and custom functions.

Ever found yourself wanting to integrate AI models into your projects but worried about reliability? ModelMix helps you build resilient AI applications by chaining multiple models together. If one model fails, it automatically switches to the next one, ensuring your application keeps running smoothly.

## ✨ Features

- **Unified Interface**: Interact with multiple AI models through a single, coherent API.
- **Request Rate Control**: Manage the rate of requests to adhere to provider limitations using Bottleneck.
- **Flexible Integration**: Easily integrate popular models like OpenAI, Anthropic, Gemini, Perplexity, Groq, Together AI, Lambda, Ollama, LM Studio or custom models.
- **History Tracking**: Automatically logs the conversation history with model responses, allowing you to limit the number of historical messages with `max_history`.
- **Model Fallbacks**: Automatically try different models if one fails or is unavailable.
- **Chain Multiple Models**: Create powerful chains of models that work together, with automatic fallback if one fails.
- **Model Context Protocol (MCP) Support**: Seamlessly integrate external tools and capabilities like web search, code execution, or custom functions through the Model Context Protocol standard.

## 🛠️ Usage

1. **Install the ModelMix package:**
Recommended: install dotenv to manage environment variables
```bash
npm install modelmix dotenv
```

2. **Setup your environment variables (.env file)**:
Only the API keys you plan to use are required.
```plaintext
ANTHROPIC_API_KEY="sk-ant-..."
OPENAI_API_KEY="sk-proj-..."
MINIMAX_API_KEY="your-minimax-key..."
...
GOOGLE_API_KEY="AIza..."
```

3. **Create and configure your models**:

```javascript
import 'dotenv/config';
import { ModelMix } from 'modelmix';

// Get structured JSON responses
const model = ModelMix.new()
    .sonnet4() // Anthropic claude-sonnet-4-20250514
    .addText("Name and capital of 3 South American countries.");

const outputExample = { countries: [{ name: "", capital: "" }] };
console.log(await model.json(outputExample));
```

**Chain multiple models with automatic fallback**

```javascript
const setup = {
    config: {
        system: "You are ALF, if they ask your name, respond with 'ALF'.",
        debug: true
    }
};

const model = await ModelMix.new(setup)
    .sonnet4() // (main model) Anthropic claude-sonnet-4-20250514
    .gpt5mini() // (fallback 1) OpenAI gpt-5-mini
    .gemini25flash({ config: { temperature: 0 } }) // (fallback 2) Google gemini-2.5-flash
    .gpt5nano() // (fallback 3) OpenAI gpt-5-nano
    .grok3mini() // (fallback 4) Grok grok-3-mini
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

This pattern allows you to:
- Chain multiple models together
- Automatically fall back to the next model if one fails
- Get structured JSON responses when needed
- Keep your code clean and maintainable

## 🔧 Model Context Protocol (MCP) Integration

ModelMix makes it incredibly easy to enhance your AI models with powerful capabilities through the Model Context Protocol. With just a few lines of code, you can add features like web search, code execution, or any custom functionality to your models.

### Example: Adding Web Search Capability

Include the API key for Brave Search in your .env file.
```
BRAVE_API_KEY="BSA0..._fm"
```

```javascript
const mmix = ModelMix.new({ config: { max_history: 10 } }).gpt5nano();
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

## ⚡️ Shorthand Methods

ModelMix provides convenient shorthand methods for quickly accessing different AI models.
Here's a comprehensive list of available methods:

| Method             | Provider   | Model                          | Price (I/O) per 1 M tokens |
| ------------------ | ---------- | ------------------------------ | -------------------------- |
| `gpt51()`          | OpenAI     | gpt-5.1                        | [\$1.25 / \$10.00][1]      |
| `gpt5()`           | OpenAI     | gpt-5                          | [\$1.25 / \$10.00][1]      |
| `gpt5mini()`       | OpenAI     | gpt-5-mini                     | [\$0.25 / \$2.00][1]       |
| `gpt5nano()`       | OpenAI     | gpt-5-nano                     | [\$0.05 / \$0.40][1]       |
| `gpt41()`          | OpenAI     | gpt-4.1                        | [\$2.00 / \$8.00][1]       |
| `gpt41mini()`      | OpenAI     | gpt-4.1-mini                   | [\$0.40 / \$1.60][1]       |
| `gpt41nano()`      | OpenAI     | gpt-4.1-nano                   | [\$0.10 / \$0.40][1]       |
| `o3()`             | OpenAI     | o3                             | [\$10.00 / \$40.00][1]     |
| `gptOss()`         | Together   | gpt-oss-120B                   | [\$0.15 / \$0.60][7]       |
| `opus41[think]()`  | Anthropic  | claude-opus-4-1-20250805       | [\$15.00 / \$75.00][2]     |
| `sonnet45[think]()`| Anthropic  | claude-sonnet-4-5-20250929     | [\$3.00 / \$15.00][2]      |
| `sonnet4[think]()` | Anthropic  | claude-sonnet-4-20250514       | [\$3.00 / \$15.00][2]      |
| `haiku35()`        | Anthropic  | claude-3-5-haiku-20241022      | [\$0.80 / \$4.00][2]       |
| `haiku45[think]()` | Anthropic  | claude-haiku-4-5-20251001      | [\$1.00 / \$5.00][2]       |
| `gemini25flash()`   | Google     | gemini-2.5-flash-preview-04-17  | [\$0.00 / \$0.00][3]       |
| `gemini25proExp()` | Google     | gemini-2.5-pro-exp-03-25       | [\$0.00 / \$0.00][3]       |
| `gemini25pro()`    | Google     | gemini-2.5-pro-preview-05-06   | [\$2.50 / \$15.00][3]      |
| `grok3()`          | Grok       | grok-3                         | [\$3.00 / \$15.00][6]      |
| `grok3mini()`      | Grok       | grok-3-mini                    | [\$0.30 / \$0.50][6]       |
| `grok4()`          | Grok       | grok-4-0709                    | [\$3.00 / \$15.00][6]      |
| `minimaxM2()`      | MiniMax    | MiniMax-M2                     | [\$0.30 / \$1.20][9]       |
| `sonar()`          | Perplexity | sonar                          | [\$1.00 / \$1.00][4]       |
| `sonarPro()`       | Perplexity | sonar-pro                      | [\$3.00 / \$15.00][4]      |
| `scout()`          | Groq       | Llama-4-Scout-17B-16E-Instruct | [\$0.11 / \$0.34][5]       |
| `maverick()`       | Groq       | Maverick-17B-128E-Instruct-FP8 | [\$0.20 / \$0.60][5]       |
| `hermes3()`        | Lambda     | Hermes-3-Llama-3.1-405B-FP8    | [\$0.80 / \$0.80][8]       |
| `qwen3()`          | Together   | Qwen3-235B-A22B-fp8-tput       | [\$0.20 / \$0.60][7]       |
| `kimiK2()`         | Together   | Kimi-K2-Instruct               | [\$1.00 / \$3.00][7]       |
| `kimiK2think()`    | Together   | moonshotai/Kimi-K2-Thinking    | [\$1.20 / \$4.00][7]       |

[1]: https://openai.com/api/pricing/ "Pricing | OpenAI"
[2]: https://docs.anthropic.com/en/docs/about-claude/pricing "Pricing - Anthropic"
[3]: https://ai.google.dev/gemini-api/docs/pricing "Google AI for Developers"
[4]: https://docs.perplexity.ai/guides/pricing "Pricing - Perplexity"
[5]: https://groq.com/pricing/ "Groq Pricing"
[6]: https://docs.x.ai/docs/models "xAI"
[7]: https://www.together.ai/pricing "Together AI"
[8]: https://lambda.ai/inference "Lambda Pricing"
[9]: https://www.minimax.io/price "MiniMax Pricing"

Each method accepts optional `options` and `config` parameters to customize the model's behavior. For example:

```javascript
const result = await ModelMix.new({ 
        options: { temperature: 0.7 },
        config: { system: "You are a helpful assistant" }
    })
    .sonnet37()
    .addText("Tell me a story about a cat");
    .message();
```

## 🔄 Templating Methods

### `replace` Method

The `replace` method is used to define key-value pairs for text replacement in the messages and system prompt. 

#### Usage:
```javascript
model.replace({ '{{key1}}': 'value1', '{{key2}}': 'value2' });
```

#### How it works:
1. It updates the `config.replace` object with the provided key-value pairs.
2. In the template, placeholders like `{{key1}}` will be replaced with 'value1'.

#### Example:
```javascript
model
  .replace({ '{{name}}': 'Alice', '{{age}}': '30' })
  .addText('Hello {{name}}, are you {{age}} years old?');
```
This would result in the message: "Hello Alice, are you 30 years old?"

### `replaceKeyFromFile` Method

The `replaceKeyFromFile` method is similar to `replace`, but it reads the replacement value from a file.

#### Usage:
```javascript
model.replaceKeyFromFile('longText', './path/to/file.txt');
```

#### How it works:
1. It reads the content of the specified file synchronously.
2. It then calls the `replace` method, using the provided key and the file content as the value.

#### Example:
```javascript
messageHandler
  .replaceKeyFromFile('article_file_contents', './article.txt')
  .addText('Please summarize this article: article_file_contents');
```
This would replace `article_file_contents` with the entire content of 'article.txt'.

### When to use each method:
- Use `replace` for short, inline replacements or dynamically generated content.
- Use `replaceKeyFromFile` for longer texts or content that's stored externally.

Both methods allow for flexible content insertion, enabling you to create dynamic and customizable prompts for your AI model interactions.

## 🧩 JSON Export Options

The `json` method signature includes these options:

```javascript
async json(schemaExample = null, schemaDescription = {}, { 
    type = 'json_object', 
    addExample = false, 
    addSchema = true, 
    addNote = false 
} = {})
```

### Option Details

**`addSchema` (default: `true`)**
- When set to `true`, includes the generated JSON schema in the system prompt

**`addExample` (default: `false`)**
- When set to `true`, adds the example JSON structure to the system prompt

**`addNote` (default: `false`)**
- When set to `true`, adds a technical note about JSON formatting requirements
- Specifically adds this instruction to the system prompt:
  ```
  Output JSON Note: Escape all unescaped double quotes, backslashes, and ASCII control characters inside JSON strings, and ensure the output contains no comments.
  ```
- Helps prevent common JSON parsing errors

### Usage Examples

```javascript
// Basic usage with example and note
const result = await model.json(
    { name: "John", age: 30, skills: ["JavaScript", "Python"] },
    { name: "Person's full name", age: "Age in years" },
    { addExample: true, addNote: true }
);

// Only add the example, skip the technical note
const result = await model.json(
    { status: "success", data: [] },
    {},
    { addExample: true, addNote: false }
);

// Add note for robust JSON parsing
const result = await model.json(
    { message: "Hello \"world\"" },
    {},
    { addNote: true }
);
```

These options give you fine-grained control over how much guidance you provide to the model for generating properly formatted JSON responses.

## 🐛 Enabling Debug Mode

To activate debug mode in ModelMix and view detailed request information, follow these two steps:

1. In the ModelMix constructor, include `debug: true` in the configuration:

   ```javascript
   const mix = ModelMix.new({
     config: {
       debug: true
       // ... other configuration options ...
     }
   });
   ```

2. When running your script from the command line, use the `DEBUG=ModelMix*` prefix:

   ```
   DEBUG=ModelMix* node your_script.js
   ```

When you run your script this way, you'll see detailed information about the requests in the console, including the configuration and options used for each AI model request.

This information is valuable for debugging and understanding how ModelMix is processing your requests.

## 🚦 Bottleneck Integration

ModelMix now uses Bottleneck for efficient rate limiting of API requests. This integration helps prevent exceeding API rate limits and ensures smooth operation when working with multiple models or high request volumes.

### How it works:

1. **Configuration**: Bottleneck is configured in the ModelMix constructor. You can customize the settings or use the default configuration:

```javascript
const setup = {
    config: {
        bottleneck: {
            maxConcurrent: 8,     // Maximum number of concurrent requests
            minTime: 500          // Minimum time between requests (in ms)
        }
    }
};
```

2. **Rate Limiting**: When you make a request using any of the attached models, Bottleneck automatically manages the request flow based on the configured settings.

3. **Automatic Queueing**: If the rate limit is reached, Bottleneck will automatically queue subsequent requests and process them as capacity becomes available.

This integration ensures that your application respects API rate limits while maximizing throughput, providing a robust solution for managing multiple AI model interactions.

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
    - `bottleneck`: Configures the rate limiting behavior using Bottleneck. For example:
      - `maxConcurrent`: Maximum number of concurrent requests
      - `minTime`: Minimum time between requests (in ms)
      - `reservoir`: Number of requests allowed in the reservoir period
      - `reservoirRefreshAmount`: How many requests are added when the reservoir refreshes
      - `reservoirRefreshInterval`: Reservoir refresh interval
    - ...(Additional configuration parameters can be added as needed)

**Methods**

- `attach(modelKey, modelInstance)`: Attaches a model instance to the `ModelMix`.
- `new()`: `static` Creates a new `ModelMix`.
- `new()`: Creates a new `ModelMix` using instance setup.

- `addText(text, config = { role: "user" })`: Adds a text message.
- `addTextFromFile(filePath, config = { role: "user" })`: Adds a text message from a file path.
- `addImage(filePath, config = { role: "user" })`: Adds an image message from a file path.
- `addImageFromUrl(url, config = { role: "user" })`: Adds an image message from URL.
- `message()`: Sends the message and returns the response.
- `raw()`: Sends the message and returns the raw response data.
- `stream(callback)`: Sends the message and streams the response, invoking the callback with each streamed part.
- `json(schemaExample, descriptions = {})`: Forces the model to return a response in a specific JSON format.
  - `schemaExample`: Optional example of the JSON structure to be returned.
  - `descriptions`: Optional descriptions for each field in the JSON structure
  - Returns a Promise that resolves to the structured JSON response
  - Example:
    ```javascript
    const response = await handler.json(
      { time: '24:00:00', message: 'Hello' },
      { time: 'Time in format HH:MM:SS' }
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