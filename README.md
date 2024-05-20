# 🧬 ModelMix: Unified API for Diverse AI Language Models

**ModelMix** is a versatile module that enables seamless integration of various language models from different providers through a unified interface. With ModelMix, you can effortlessly manage and utilize multiple AI models while controlling parallel requests to avoid provider restrictions. 

## ✨ Features 

- **Unified Interface**: Interact with multiple AI models through a single, coherent API.
- **Request Control**: Manage the number of parallel requests to adhere to provider limitations.
- **Flexible Integration**: Easily integrate popular models like OpenAI and Anthropic, as well as custom models such as Perplexity.
- **History Tracking:** Automatically logs the conversation history with model responses, allowing you to limit the number of historical messages with max_history.

## 📦 Installation

First, install the ModelMix package:

```bash
npm install modelmix
```

You'll also need to install the respective SDKs for each model provider you plan to use:

```bash
npm install openai @anthropic-ai/sdk dotenv
```

## 🛠️ Usage

Here's a quick example to get you started:

1. **Setup your environment variables (.env file)**:
    ```plaintext
    OPENAI_API_KEY=your_openai_api_key
    ANTHROPIC_API_KEY=your_anthropic_api_key
    PPLX_API_KEY=your_perplexity_api_key
    ```

2. **Create and configure your models**:

    ```javascript
    import 'dotenv/config'
    import OpenAI from 'openai';
    import Anthropic from '@anthropic-ai/sdk';

    import { ModelMix, OpenAIModel, AnthropicModel, CustomModel } from 'modelmix';

    const env = process.env;

    const mmix = new ModelMix({
        options: {
            max_tokens: 200,
        },
        config: {
            system: "You are ALF from Melmac.",
            max_history: 2
        }
    });

    mmix.attach(new OpenAIModel(new OpenAI({ apiKey: env.OPENAI_API_KEY })));
    mmix.attach(new AnthropicModel(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })));
    mmix.attach(new CustomModel({
        config: {
            url: 'https://api.perplexity.ai/chat/completions',
            bearer: env.PPLX_API_KEY,
            prefix: ["pplx", "llama", "mixtral"],
            system: "You are my personal assistant."
        }
    }));
    ```

3. **Generate responses from different models**:

    ```javascript

    const gpt = mmix.create('gpt-4o', { temperature: 0.5 }).addText("Have you ever eaten a cat?");
    console.log(await gpt.message());

    const claude = mmix.create('claude-3-sonnet-20240229', { temperature: 0.5 });
    await claude.addImage("./watson.png")
    const imageDescription = await claude.addText("describe the image").message();
    console.log(imageDescription);

    const pplx = mmix.create('pplx-70b-online', { max_tokens: 500 });
    await pplx.addText('How much is ETH trading in USD?');
    const news = await pplx.addText('What are the 3 most recent Ethereum news?').message();
    console.log(news);
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
    - ...
  - **config**: This object contains configuration settings that control the behavior of the `ModelMix` instance. These settings can also be overridden for specific model instances. Examples of configuration settings include:
    - `system`: Sets the default system message for the model, e.g., "You are an assistant."
    - `max_history`: Limits the number of historical messages to retain, e.g., 5.
    - `max_request`: Limits the number of parallel request.
    - ...

**Methods**

- `attach(modelInstance)`: Attaches a model instance to the `ModelMix`.
- `create(modelKey, overOptions = {})`: Creates a new `MessageHandler` for the specified model.

#### MessageHandler

**Methods**

- `new()`: Initializes a new message handler instance.
- `addText(text, config = { role: "user" })`: Adds a text message.
- `addImage(filePath, config = { role: "user" })`: Adds an image message from a file path.
- `message()`: Sends the message and returns the response.
- `raw()`: Sends the message and returns the raw response data.

#### OpenAIModel

```javascript
new OpenAIModel(openai, args = { options: {}, config: {} })
```

- **openai**: Instance of the OpenAI client.
- **args**: Configuration object with `options` and `config` properties.

#### AnthropicModel

```javascript
new AnthropicModel(anthropic, args = { options: {}, config: {} })
```

- **anthropic**: Instance of the Anthropic client.
- **args**: Configuration object with `options` and `config` properties.

#### CustomModel

```javascript
new CustomModel(args = { config: {}, options: {} })
```

- **args**: Configuration object with `config` and `options` properties.
  - **config**: 
    - `url`: 
    - `bearer`: 
    - `prefix`: 
    - ...
  - **options**: This object contains default options that are applied to all models. These options can be overridden when creating a specific model instance. Examples of default options include:
    - `max_tokens`: Sets the maximum number of tokens to generate, e.g., 2000.
    - `temperature`: Controls the randomness of the model's output, e.g., 1.
    - `top_p`: Controls the diversity of the output, e.g., 1.
    - ...

## 🤝 Contributing

Contributions are welcome! If you find any issues or have suggestions for improvement, please open an issue or submit a pull request on the [GitHub repository](https://github.com/clasen/ModelMix).

## 📄 License

The MIT License (MIT)

Copyright (c) Martin Clasen

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.