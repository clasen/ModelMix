# 🧬 ModelMix: Unified API for Diverse AI Language Models

**ModelMix** is a versatile module that enables seamless integration of various language models from different providers through a unified interface. With ModelMix, you can effortlessly manage and utilize multiple AI models while controlling parallel requests to avoid provider restrictions.

## ✨ Features

- **Unified Interface**: Interact with multiple AI models through a single, coherent API.
- **Request Control**: Manage the number of parallel requests to adhere to provider limitations (`max_request`).
- **Flexible Integration**: Easily integrate popular models like OpenAI, Anthropic, Perplexity, Groq, Ollama, LM Studio or custom models.
- **History Tracking**: Automatically logs the conversation history with model responses, allowing you to limit the number of historical messages with `max_history`.

## 📦 Installation

First, install the ModelMix package:

```bash
npm install modelmix
```

Also, install dotenv to manage environment variables:

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
    ```

2. **Create and configure your models**:

    ```javascript
    import 'dotenv/config';
    import { ModelMix, MixOpenAI, MixAnthropic, MixPerplexity, MixOllama } from 'modelmix';

    const env = process.env;

    const mmix = new ModelMix({
        options: {
            max_tokens: 200,
        },
        config: {
            system: "You are {name} from Melmac.",
            max_history: 2,
            max_request: 1,
        }
    });

    mmix.replace({ '{name}': 'ALF' });

    mmix.attach(new MixOpenAI({ config: { apiKey: env.OPENAI_API_KEY } }));
    mmix.attach(new MixAnthropic({ config: { apiKey: env.ANTHROPIC_API_KEY } }));
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
    ```

3. **Generate responses from different models**:

    ```javascript
    console.log("\n" + '--------| gpt-4o |--------');
    const gpt = mmix.create('gpt-4o', { temperature: 0.5 }).addText("Have you ever eaten a {animal}?");
    gpt.replace({ '{animal}': 'cat' });
    console.log(await gpt.message());

    console.log("\n" + '--------| claude-3-sonnet-20240229 |--------');
    const claude = mmix.create('claude-3-sonnet-20240229', { temperature: 0.5 });
    claude.addImage("./watson.jpg");
    const imageDescription = await claude.addText("Describe the image").message();
    console.log(imageDescription);

    console.log("\n" + '--------| pplx-70b-online |--------');
    const pplx = mmix.create('pplx-70b-online', { max_tokens: 500 });
    pplx.addText('How much is ETH trading in USD?');
    const news = await pplx.addText('What are the 3 most recent Ethereum news?').message();
    console.log(news);

    console.log("\n" + '--------| ollama (llava:latest) |--------');
    await mmix.create('llava:latest')
        .addImage("./watson.jpg")
        .addText("What is the predominant color?")
        .stream((data) => { console.log(data.message); });
    ```
4. Find the files for this example at: [/ModelMix/demo](https://github.com/clasen/ModelMix/tree/master/demo).
   
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
    - `max_request`: Limits the number of parallel requests, e.g., 1.
    - ...(Additional configuration parameters can be added as needed)

**Methods**

- `attach(modelInstance)`: Attaches a model instance to the `ModelMix`.
- `create(modelKey, overOptions = {})`: Creates a new `MessageHandler` for the specified model.

### MessageHandler Class Overview

**Methods**

- `new()`: Initializes a new message handler instance.
- `addText(text, config = { role: "user" })`: Adds a text message.
- `addImage(filePath, config = { role: "user" })`: Adds an image message from a file path.
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

## 🤝 Contributing

Contributions are welcome! If you find any issues or have suggestions for improvement, please open an issue or submit a pull request on the [GitHub repository](https://github.com/clasen/ModelMix).

## 📄 License

The MIT License (MIT)

Copyright (c) Martin Clasen

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.