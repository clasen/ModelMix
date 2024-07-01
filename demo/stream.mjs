import 'dotenv/config'

import { ModelMix, MixOpenAI, MixAnthropic, MixPerplexity, MixOllama } from '../index.js';

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

mmix.attach(new MixOpenAI({
    config: {
        apiKey: env.OPENAI_API_KEY,
    }
}));

mmix.attach(new MixAnthropic({ config: { apiKey: env.ANTHROPIC_API_KEY } }));

mmix.attach(new MixPerplexity({
    config: {
        apiKey: env.PPLX_API_KEY
    },
    system: "You are my personal assistant."
}));

mmix.attach(new MixOllama({
    config: {
        url: 'http://localhost:11434/api/chat',
        prefix: ['openhermes2'],
        system: 'You are ALF, soy de Melmac.',
    },
    options: {
        temperature: 0,
    }
}));

mmix.attach(new MixOllama({
    config: {
        url: 'http://localhost:11434/api/chat',
        prefix: ['llava'],
    },
    options: {
        temperature: 0,
    }
}));


await mmix.create('gpt-4o')
    .addImage('./watson.jpg')
    .addText('describe')
    .stream((data) => { console.log(data.message); });

await mmix.create('claude-3-haiku-20240307')
    .addImage('./watson.jpg')
    .addText('describe')
    .stream((data) => { console.log(data.message); });

await mmix.create('llava:latest')
    .addImage('./watson.jpg')
    .addText('describe')
    .stream((data) => { console.log(data.message); });

await mmix.create('pplx-70b-online')
    .addText('Who is the president of salvador?')
    .stream((data) => { console.log(data.message); });

await mmix.create('openhermes2-mistral:latest')
    .addText('Who is the president of salvador?')
    .stream((data) => { console.log(data.message); });

console.log(r)
