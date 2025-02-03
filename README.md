# 🧬 ModelMix: Unified API for Diverse AI LLM

**ModelMix** is a versatile module that enables seamless integration of various language models from different providers through a unified interface. With ModelMix, you can effortlessly manage and utilize multiple AI models while controlling request rates to avoid provider restrictions.

## ✨ Features

- **Unified Interface**: Interact with multiple AI models through a single, coherent API.
- **Request Rate Control**: Manage the rate of requests to adhere to provider limitations using Bottleneck.
- **Flexible Integration**: Easily integrate popular models like OpenAI, Anthropic, Perplexity, Groq, Together AI, Ollama, LM Studio or custom models.
- **History Tracking**: Automatically logs the conversation history with model responses, allowing you to limit the number of historical messages with `max_history`.

## 📦 Installation

First, install the ModelMix package:

```bash
npm install modelmix
```

Optional: install dotenv to manage environment variables:

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
    ```

2. **Create and configure your models**:

    ```javascript
    import 'dotenv/config';
    import { ModelMix, MixOpenAI, MixAnthropic, MixPerplexity, MixOllama, MixTogether } from 'modelmix';

    const env = process.env;

    const mmix = new ModelMix({
        options: {
            max_tokens: 200,
        },
        config: {
            system: "You are {name} from Melmac.",
            max_history: 2,
            bottleneck: { maxConcurrent: 2 },
            debug: true
        }
    });

    mmix.replace({ '{name}': 'ALF' });

    mmix.attach(new MixOpenAI({ config: { apiKey: env.OPENAI_API_KEY } }));
    mmix.attach(new MixAnthropic()); // it will use the default apiKey from process.env
    mmix.attach(new MixPerplexity({
        config: {
            apiKey: env.PPLX_API_KEY
        },
        options: {
            system: "You are my personal assistant."
        }
    }));
    mmix.attach(new MixOllama({
        config: {
            url: 'http://localhost:11434/api/chat',
            prefix: ['llava'],
        },
        options: {
            temperature: 0.5,
        }
    }));
    mmix.attach(new MixTogether());
    ```

3. **Generate responses from different models**:

    #### gpt-4o-mini
    ```javascript
    const gpt = mmix.create('gpt-4o-mini', { options: { temperature: 0 } });
    gpt.addText("Have you ever eaten a {animal}?");
    gpt.replace({ '{animal}': 'cat' });
    console.log(await gpt.message());
    ```

    #### claude-3-5-sonnet-20240620 (writer)
    ```javascript
    const writer = mmix.create('claude-3-5-sonnet-20240620', { options: { temperature: 0.5 } });
    writer.setSystem('You are a writer like Stephen King'); // or setSystemFromFile
    writer.replace({ '{story_title}': 'The Mysterious Package' })
    // or write.replaceKeyFromFile('{story_title}', './title.md');
    const story = await writer.addTextFromFile('./prompt.md').message();
    console.log(story);
    ```
    #### claude-3-5-sonnet-20240620 (image)
    ```javascript
    console.log("\n" + '--------|  |--------');
    const claude = mmix.create('claude-3-5-sonnet-20240620', { options: { temperature: 0 } });
    claude.addImage("./watson.jpg"); // or claude.addImageFromUrl(url)
    const imageDescription = await claude.addText("Describe the image").message();
    console.log(imageDescription);
    ```

    #### pplx-70b-online
    ```javascript
    const pplx = mmix.create('pplx-70b-online', { config: { max_tokens: 500 } });
    pplx.addText('How much is ETH trading in USD?');
    const news = await pplx.addText('What are the 3 most recent Ethereum news?').message();
    console.log(news);
    ```

    #### ollama (llava:latest)
    ```javascript
    await mmix.create('llava:latest')
        .addImage("./watson.jpg")
        .addText("What is the predominant color?")
        .stream((data) => { console.log(data.message); });
    ```

    #### Together AI (deepseek-ai/DeepSeek-R1)
    ```javascript
    const together = mmix.create('deepseek-ai/DeepSeek-R1', { options: { temperature: 0.7 } });
    together.addText('What are the main differences between Python and JavaScript?');
    const comparison = await together.message();
    console.log(comparison);
    ```
4. Find the files for this example at: [/ModelMix/demo](https://github.com/clasen/ModelMix/tree/master/demo).

## 🔄 Templating Methods

### `replace` Method

The `replace` method is used to define key-value pairs for text replacement in the messages and system prompt. 

#### Usage:
```javascript
gpt.replace({ '{{key1}}': 'value1', '{{key2}}': 'value2' });
```

#### How it works:
1. It updates the `config.replace` object with the provided key-value pairs.
2. In the template, placeholders like `{{key1}}` will be replaced with 'value1'.

#### Example:
```javascript
gpt
  .replace({ '{{name}}': 'Alice', '{{age}}': '30' })
  .addText('Hello {{name}}, are you {{age}} years old?');
```
This would result in the message: "Hello Alice, are you 30 years old?"

### `replaceKeyFromFile` Method

The `replaceKeyFromFile` method is similar to `replace`, but it reads the replacement value from a file.

#### Usage:
```javascript
messageHandler.replaceKeyFromFile('longText', './path/to/file.txt');
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

## 🐛 Enabling Debug Mode

To activate debug mode in ModelMix and view detailed request information, follow these two steps:

1. In the ModelMix constructor, include `debug: true` in the configuration:

   ```javascript
   const mix = new ModelMix({
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
    const mmix = new ModelMix({
        config: {
            bottleneck: {
                maxConcurrent: 8,     // Maximum number of concurrent requests
                minTime: 500          // Minimum time between requests (in ms)
            }
        }
    });
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
    - `max_history`: Limits the number of historical messages to retain, e.g., 5.
    - `bottleneck`: Configures the rate limiting behavior using Bottleneck. For example:
      - `maxConcurrent`: Maximum number of concurrent requests
      - `minTime`: Minimum time between requests (in ms)
      - `reservoir`: Number of requests allowed in the reservoir period
      - `reservoirRefreshAmount`: How many requests are added when the reservoir refreshes
      - `reservoirRefreshInterval`: Reservoir refresh interval
    - ...(Additional configuration parameters can be added as needed)

**Methods**

- `attach(modelInstance)`: Attaches a model instance to the `ModelMix`.
- `create(modelKey, overOptions = {})`: Creates a new `MessageHandler` for the specified model.

### MessageHandler Class Overview

**Methods**

- `new()`: Initializes a new message handler instance.
- `addText(text, config = { role: "user" })`: Adds a text message.
- `addTextFromFile(filePath, config = { role: "user" })`: Adds a text message from a file path.
- `addImage(filePath, config = { role: "user" })`: Adds an image message from a file path.
- `addImageFromUrl(url, config = { role: "user" })`: Adds an image message from URL.
- `message()`: Sends the message and returns the response.
- `raw()`: Sends the message and returns the raw response data.
- `stream(callback)`: Sends the message and streams the response, invoking the callback with each streamed part.

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

## 🤝 Contributing

Contributions are welcome! If you find any issues or have suggestions for improvement, please open an issue or submit a pull request on the [GitHub repository](https://github.com/clasen/ModelMix).

## 📄 License

The MIT License (MIT)

Copyright (c) Martin Clasen

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.