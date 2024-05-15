# 🧬 ModelMix: Integrate Multiple AI Language Models with Ease

**ModelMix** is a versatile module that enables seamless integration of various language models from different providers through a unified interface. With ModelMix, you can effortlessly manage and utilize multiple AI models while controlling parallel requests to avoid provider restrictions. 

## ✨ Features 

- **Unified Interface**: Interact with multiple AI models through a single, coherent API.
- **Request Control**: Manage the number of parallel requests to adhere to provider limitations.
- **Flexible Integration**: Easily integrate popular models like OpenAI and Anthropic, as well as custom models such as Perplexity.

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
    const env = process.env;

    import OpenAI from 'openai';
    import Anthropic from '@anthropic-ai/sdk';

    import { ModelMix, OpenAIModel, AnthropicModel, CustomModel } from 'model-mix';

    const driver = new ModelMix({ system: "You are ALF from Melmac.", max_tokens: 200 });

    driver.attach(new OpenAIModel(new OpenAI({ apiKey: env.OPENAI_API_KEY })));
    driver.attach(new AnthropicModel(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })));
    driver.attach(new CustomModel({
        config: {
            url: 'https://api.perplexity.ai/chat/completions',
            bearer: env.PPLX_API_KEY,
            prefix: ["pplx", "llama", "mixtral"]
        }
    }));
    ```

3. **Generate responses from different models**:

    ```javascript
    const question = 'Have you ever eaten a cat?';

    console.log("OpenAI - gpt-4o");
    const txtGPT = await driver.create(question, 'gpt-4o', { max_tokens: 100 });
    console.log(txtGPT);

    console.log("-------\n");

    console.log("Anthropic - claude-3-sonnet-20240229");
    const txtClaude = await driver.create(question, 'claude-3-sonnet-20240229', { temperature: 0.5 });
    console.log(txtClaude);

    console.log("-------\n");

    console.log("Perplexity - pplx-70b-online");
    const txtPPLX = await driver.create(question, 'pplx-70b-online');
    console.log(txtPPLX);
    ```

## 📚 ModelMix Class Overview

### `ModelMix` Class

#### Constructor
- **options**: An optional configuration object for setting default values.

#### Methods
- **`attach(modelInstance)`**: Attach a new model instance to the ModelMix.
  - **modelInstance**: An instance of a model class (e.g., `OpenAIModel`, `AnthropicModel`, `CustomModel`).

- **`create(prompt, modelKey, options = {})`**: Create a request to a specific model.
  - **prompt**: The input prompt to send to the model.
  - **modelKey**: The model key to identify which model to use.
  - **options**: Optional configuration overrides for the request.

- **`processQueue(modelEntry)`**: Process the request queue for a specific model instance.
  - **modelEntry**: The model instance whose queue will be processed.

### `OpenAIModel` Class

#### Constructor
- **openai**: An instance of the OpenAI client.
- **args**: Configuration and options for the model.

#### Methods
- **`create(prompt, options = {})`**: Send a prompt to the OpenAI model and return the response.
  - **prompt**: The input prompt to send to the model.
  - **options**: Optional configuration overrides for the request.

### `AnthropicModel` Class

#### Constructor
- **anthropic**: An instance of the Anthropic client.
- **args**: Configuration and options for the model.

#### Methods
- **`create(prompt, options = {})`**: Send a prompt to the Anthropic model and return the response.
  - **prompt**: The input prompt to send to the model.
  - **options**: Optional configuration overrides for the request.

### `CustomModel` Class

#### Constructor
- **args**: Configuration and options for the model.

#### Methods
- **`create(prompt, options = {})`**: Send a prompt to a custom model and return the response.
  - **prompt**: The input prompt to send to the model.
  - **options**: Optional configuration overrides for the request.

## 🤝 Contributing

Contributions are welcome! If you find any issues or have suggestions for improvement, please open an issue or submit a pull request on the [GitHub repository](https://github.com/clasen/ModelMix).

## 📄 License

The MIT License (MIT)

Copyright (c) Martin Clasen

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.