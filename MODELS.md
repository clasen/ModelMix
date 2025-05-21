# ModelMix Provider Documentation

This document describes how each model provider in ModelMix handles data input and output formats.

## Common Structure

All providers inherit from `MixCustom` base class which provides common functionality for:
- API key management
- Error handling
- Basic request/response processing
- Stream handling

## Provider-Specific Details

### OpenAI (MixOpenAI)
- **Base URL**: `https://api.openai.com/v1/chat/completions`
- **Input Format**:
  ```json
  {
    "messages": [
      {
        "role": "system",
        "content": "system message"
      },
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "message text"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/jpeg;base64,..."
            }
          }
        ]
      }
    ],
    "model": "model-name",
    "temperature": 1,
    "max_tokens": 5000,
    "top_p": 1
  }
  ```
- **Output Format**:
  ```json
  {
    "choices": [
      {
        "message": {
          "content": "response text"
        }
      }
    ]
  }
  ```
- **Special Notes**: 
  - Removes `max_tokens` and `temperature` for o1/o3 models
  - Converts image messages to base64 data URLs

#### Function Calling

**CALL**
```json
{
    role: 'assistant',
    tool_calls: [
        {
            id: 'call_GibonUAFsx7yHs20AhmzELG9',
            type: 'function',
            function: {
                name: 'brave_web_search',
                arguments: '{"query":"Pope Francis death"}'
            }
        }
    ]
}
```
**USE**
```json
{
    role: "tool",
    tool_call_id: "call_GibonUAFsx7yHs20AhmzELG9",
    content: "Pope Francis death 2022-12-15"
}
```

### Anthropic (MixAnthropic)
- **Base URL**: `https://api.anthropic.com/v1/messages`
- **Input Format**:
  ```json
  {
    "system": "system message",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "message text"
          },
          {
            "type": "image",
            "source": {
              "type": "base64",
              "media_type": "image/jpeg",
              "data": "base64data"
            }
          }
        ]
      }
    ],
    "model": "claude-3-sonnet-20240229",
    "temperature": 1,
    "top_p": 1
  }
  ```
- **Output Format**:
  ```json
  {
    "content": [
      {
        "text": "response text"
      }
    ]
  }
  ```
- **Special Notes**:
  - Removes `top_p` when thinking mode is enabled
  - Uses `x-api-key` header instead of `authorization`
  - Requires `anthropic-version` header

### Function Calling

**CALL**
```json
{
    role: 'assistant',
    content: [
        {
            type: 'text',
            text: "I'll search for information about Pope Francis's death."
        },
        {
            type: 'tool_use',
            id: 'toolu_018YeoPLbQwE6WKLSJipkGLE',
            name: 'brave_web_search',
            input: { query: 'When did Pope Francis die?' }
        }
    ]
}
```
**USE**
```json
{
    role: 'user',
    content: [
        {
            type: 'tool_result',
            tool_use_id: 'toolu_01GbfgjLrtNhnE9ZqinJmXYc',
            content: 'Pope Francis died on April 21, 2025.'
        }
    ]
}
```


### Perplexity (MixPerplexity)
- **Base URL**: `https://api.perplexity.ai/chat/completions`
- **Input Format**: Same as OpenAI
- **Output Format**: Same as OpenAI
- **Special Notes**: Uses standard OpenAI-compatible format

### Grok (MixGrok)
- **Base URL**: `https://api.x.ai/v1/chat/completions`
- **Input Format**: Same as OpenAI
- **Output Format**: Same as OpenAI
- **Special Notes**: Inherits from MixOpenAI

### Together (MixTogether)
- **Base URL**: `https://api.together.xyz/v1/chat/completions`
- **Input Format**:
  ```json
  {
    "messages": [
      {
        "role": "system",
        "content": "system message"
      },
      {
        "role": "user",
        "content": "message text"
      }
    ],
    "model": "model-name",
    "stop": ["<|eot_id|>", "<|eom_id|>"]
  }
  ```
- **Output Format**: Same as OpenAI
- **Special Notes**: 
  - Flattens content arrays to strings
  - Adds default stop tokens

### Google (MixGoogle)
- **Base URL**: `https://generativelanguage.googleapis.com/v1beta/models`
- **Input Format**:
  ```json
  {
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "message text"
          },
          {
            "inline_data": {
              "mime_type": "image/jpeg",
              "data": "base64data"
            }
          }
        ]
      }
    ],
    "generationConfig": {
      "responseMimeType": "text/plain"
    }
  }
  ```
- **Output Format**:
  ```json
  {
    "candidates": [
      {
        "content": {
          "parts": [
            {
              "text": "response text"
            }
          ]
        }
      }
    ]
  }
  ```
- **Special Notes**:
  - Uses different role names (`model` instead of `assistant`)
  - Requires model ID in URL path
  - Doesn't support streaming
  - Available Gemini models:
    - `gemini-2.5-flash-preview-04-17`
    - `gemini-2.5-pro-exp-03-25`
    - `gemini-2.5-pro-preview-05-06`
  - Each model has different capabilities:
    - Flash: Fastest response time, best for simple tasks
    - Pro: More capable, better for complex tasks
    - Pro Exp: Experimental version with latest features

### Function Calling

**CALL**
```json
{
    role: 'model',
    parts: [
        {
            functionCall: {
                name: `getWeather`,
                args: { "city": "tokio" },
            }
        },
    ],
}
```

**USE**
```json
{
    role: 'user',
    parts: [
        {
            functionResponse: {
                name: `getWeather`,
                response: {
                    output: `20 grados`,
                },
            }
        },
    ],
}
```

### Cerebras (MixCerebras)
- **Base URL**: `https://api.cerebras.ai/v1/chat/completions`
- **Input Format**: Same as Together
- **Output Format**: Same as OpenAI
- **Special Notes**: Uses Together's message conversion

### Ollama (MixOllama)
- **Base URL**: `http://localhost:11434/api/chat`
- **Input Format**:
  ```json
  {
    "messages": [
      {
        "role": "system",
        "content": "system message",
        "images": []
      },
      {
        "role": "user",
        "content": "message text",
        "images": ["base64data"]
      }
    ]
  }
  ```
- **Output Format**:
  ```json
  {
    "message": {
      "content": "response text"
    }
  }
  ```
- **Special Notes**: 
  - Local deployment only
  - Handles images in separate array
  - No API key required

### LM Studio (MixLMStudio)
- **Base URL**: `http://localhost:1234/v1/chat/completions`
- **Input Format**: Same as OpenAI
- **Output Format**: Same as OpenAI
- **Special Notes**: 
  - Local deployment only
  - No API key required

### Groq (MixGroq)
- **Base URL**: `https://api.groq.com/openai/v1/chat/completions`
- **Input Format**: Same as OpenAI
- **Output Format**: Same as OpenAI
- **Special Notes**: Uses OpenAI-compatible format 