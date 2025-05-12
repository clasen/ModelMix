# 🧬 ModelMix: Unified API for Diverse AI LLM

**ModelMix** is a versatile module that enables seamless integration of various language models from different providers through a unified interface. With ModelMix, you can effortlessly manage and utilize multiple AI models while controlling request rates to avoid provider restrictions.

Are you one of those developers who wants to apply language models to everything? Do you need a reliable fallback system to ensure your application never fails? ModelMix is the answer! It allows you to chain multiple models together, automatically falling back to the next model if one fails, ensuring your application always gets a response.

## ✨ Features

- **Unified Interface**: Interact with multiple AI models through a single, coherent API.
- **Request Rate Control**: Manage the rate of requests to adhere to provider limitations using Bottleneck.
- **Flexible Integration**: Easily integrate popular models like OpenAI, Anthropic, Perplexity, Groq, Together AI, Ollama, LM Studio, Google Gemini or custom models.
- **History Tracking**: Automatically logs the conversation history with model responses, allowing you to limit the number of historical messages with `max_history`.
- **Model Fallbacks**: Automatically try different models if one fails or is unavailable.
- **Chain Multiple Models**: Create powerful chains of models that work together, with automatic fallback if one fails.

## 📦 Installation

First, install the ModelMix package:

```bash
npm install modelmix
```

Recommended: install dotenv to manage environment variables:

```bash
npm install dotenv
```

## 🛠️ Usage

Here's a quick example to get you started:

1. **Setup your environment variables (.env file)**:
    ```plaintext
    OPENAI_API_KEY="your_openai_api_key"
    ANTHROPIC_API_KEY="your_anthropic_api_key"
    PPLX_API_KEY="your_perplexity_api_key"
    GROQ_API_KEY="your_groq_api_key"
    TOGETHER_API_KEY="your_together_api_key"
    GOOGLE_API_KEY="your_google_api_key"
    ```

2. **Create and configure your models**:

```javascript
import 'dotenv/config';
import { ModelMix } from 'modelmix';

// Get structured JSON responses
const model = ModelMix.new()
    .sonnet37() // Anthropic claude-3-7-sonnet-20250219
    .addText("Name and capital of 3 South American countries.");

const outputExample = { countries: [{ name: "", capital: "" }] };
console.log(await model.json(outputExample));
```

```javascript
// Basic setup with system prompt and debug mode
const setup = {
    config: {
        system: "You are ALF, if they ask your name, respond with 'ALF'.",
        debug: true
    }
};

// Chain multiple models with automatic fallback
const model = await ModelMix.new(setup)
    .sonnet37think() // (main model) Anthropic claude-3-7-sonnet-20250219
    .o4mini() // (fallback 1) OpenAI o4-mini
    .gemini25proExp({ config: { temperature: 0 } }) // (fallback 2) Google gemini-2.5-pro-exp-03-25
    .gpt41nano() // (fallback 3) OpenAI gpt-4.1-nano
    .grok3mini() // (fallback 4) Grok grok-3-mini-beta
    .addText("What's your name?");

console.log(await model.message());
```

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

## ⚡️ Shorthand Methods

ModelMix provides convenient shorthand methods for quickly accessing different AI models. Here's a comprehensive list of available methods:

| Method             | Provider    | Model                          | Description                                  | Price (Input / Output) per 1 M tokens                   |
| ------------------ | ----------- | ------------------------------ | -------------------------------------------- | ------------------------------------------------------- |
| `gpt41()`          | OpenAI      | gpt-4.1                        | OpenAI's GPT-4.1 model                       | \$2.00 / \$8.00 ([OpenAI][1])                           |
| `gpt41mini()`      | OpenAI      | gpt-4.1-mini                   | OpenAI's GPT-4.1 Mini model                  | \$0.40 / \$1.60 ([OpenAI][1])                           |
| `gpt41nano()`      | OpenAI      | gpt-4.1-nano                   | OpenAI's GPT-4.1 Nano model                  | \$0.10 / \$0.40 ([OpenAI][1])                           |
| `gpt4o()`          | OpenAI      | gpt-4o                         | OpenAI's GPT-4 Optimized model               | \$5.00 / \$20.00 (texto) ([OpenAI][1])                  |
| `o4mini()`         | OpenAI      | o4-mini                        | OpenAI's O4 Mini model                       | \$1.10 / \$4.40 ([OpenAI][1])                           |
| `o3()`             | OpenAI      | o3                             | OpenAI's O3 model                            | \$10.00 / \$40.00 ([OpenAI][1])                         |
| `sonnet37()`       | Anthropic   | claude-3-7-sonnet-20250219     | Anthropic's Claude 3.7 Sonnet model          | \$3.00 / \$15.00 ([Anthropic][2], [Anthropic][3])       |
| `sonnet37think()`  | Anthropic   | claude-3-7-sonnet-20250219     | Claude 3.7 Sonnet with thinking mode enabled | \$3.00 / \$15.00 ([Anthropic][2], [Anthropic][3])       |
| `sonnet35()`       | Anthropic   | claude-3-5-sonnet-20241022     | Anthropic's Claude 3.5 Sonnet model          | \$3.00 / \$15.00 ([Anthropic][4])                       |
| `haiku35()`        | Anthropic   | claude-3-5-haiku-20241022      | Anthropic's Claude 3.5 Haiku model           | \$0.80 / \$4.00 ([Anthropic][2])                        |
| `gemini25flash()`  | Google      | gemini-2.5-flash-preview-04-17 | Google's Gemini 2.5 Flash model (preview)    | Gratuito (preview) ([Google AI for Developers][5])      |
| `gemini25proExp()` | Google      | gemini-2.5-pro-exp-03-25       | Google's Gemini 2.5 Pro Experimental         | Gratuito (experimental) ([Google AI for Developers][5]) |
| `gemini25pro()`    | Google      | gemini-2.5-pro-preview-05-06   | Google's Gemini 2.5 Pro model                | \$2.50 / \$15.00 ([Google DeepMind][6])                 |
| `sonar()`          | Perplexity  | sonar                          | Perplexity's Sonar model                     | \$1.00 / \$1.00 ([Perplexity][7])                       |
| `sonarPro()`       | Perplexity  | sonar-pro                      | Perplexity's Sonar Pro model                 | \$3.00 / \$15.00 ([Perplexity][7])                      |
| `qwen3()`          | Together AI | Qwen/Qwen3-235B-A22B-fp8-tput  | Together AI's Qwen 3 model                   | \$0.20 / \$0.60 ([Together AI][8])                      |
| `grok2()`          | Grok        | grok-2-latest                  | Grok's latest version 2 model                | \$2.00 / \$10.00 ([xAI][9])                             |
| `grok3()`          | Grok        | grok-3-beta                    | Grok's version 3 beta model                  | \$3.00 / \$15.00 ([xAI][9])                             |
| `grok3mini()`      | Grok        | grok-3-mini-beta               | Grok's version 3 mini beta model             | \$0.30 / \$0.50 ([xAI][9])                              |
| `scout()`          | Cerebras    | llama-4-scout-17b-16e-instruct | Cerebras' Llama 4 Scout model                | \$0.65 / \$0.85 ([Cerebras][10])                        |

Las cifras corresponden a precios de inferencia básicos por millón (1 M) de tokens de entrada y salida.

[1]: https://openai.com/api/pricing/ "Pricing | OpenAI"
[2]: https://www.anthropic.com/pricing "Pricing - Anthropic"
[3]: https://www.anthropic.com/news/claude-3-7-sonnet "Claude 3.7 Sonnet and Claude Code - Anthropic"
[4]: https://docs.anthropic.com/en/docs/about-claude/pricing "Pricing - Anthropic API"
[5]: https://ai.google.dev/gemini-api/docs/pricing "Gemini Developer API Pricing | Gemini API | Google AI for Developers"
[6]: https://deepmind.google/technologies/gemini/pro/ "Gemini Pro - Google DeepMind"
[7]: https://docs.perplexity.ai/guides/pricing "Pricing - Perplexity"
[8]: https://www.together.ai/pricing "Together Pricing | The Most Powerful Tools at the Best Value"
[9]: https://x.ai/api "API | xAI"
[10]: https://www.cerebras.ai/blog/llamablog "Meta Llama 4 Scout runs at 2,600 tokens per second - Cerebras"

Each method accepts optional `options` and `config` parameters to customize the model's behavior. For example:

```javascript
const result = await ModelMix.new()
    .sonnet37({ 
        options: { temperature: 0.7 },
        config: { system: "You are a helpful assistant" }
    })
    .message();
```

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
    - `top_p`: Controls the diversity of the output, e.g., 1.
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