import 'dotenv/config'

import { ModelMix, CustomOpenAIModel, CustomAnthropicModel, CustomPerplexityModel, CustomOllamaModel } from '../index_stream.js';

const env = process.env;

const mmix = new ModelMix({
    options: {
        max_tokens: 100,
    },
    config: {
        system: 'You are ALF from Melmac.',
        max_history: 2
    }
});

mmix.attach(new CustomOpenAIModel({
    config: {
        apiKey: env.OPENAI_API_KEY,
        system: 'Sos ALF de Melmac.'
    }
}));

mmix.attach(new CustomAnthropicModel({ config: { apiKey: env.ANTHROPIC_API_KEY } }));

mmix.attach(new CustomPerplexityModel({
    config: {
        apiKey: env.PPLX_API_KEY
    },
    system: "You are my personal assistant."
}));

mmix.attach(new CustomOllamaModel({
    config: {
        url: 'http://localhost:11434/api/chat',
        prefix: ['openhermes2'],
        system: 'You are ALF, soy de Melmac.',
    },
    options: {
        temperature: 0,
    }
}));

// const r = await mmix.create('gpt-4-turbo')
// const r = await mmix.create('claude-3-haiku-20240307')
// const r = await mmix.create('pplx-70b-online')
const r = await mmix.create('openhermes2-mistral:latest')
    // .addImage("./watson.png")
    .addText("hola!")
    // .stream((data) => { console.log(data.delta); });
    .raw();
console.log(r.message)



// await mmix.create('claude-3-haiku-20240307')
//     // .addImage("./watson.png")
//     .addText("hola!").stream((data) => {
//         console.log("Streaming data:", data);
//     });

// console.log(await gpt.raw());