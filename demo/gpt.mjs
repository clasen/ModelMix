import 'dotenv/config'

import { ModelMix, CustomOpenAIModel } from '../index.js';

const env = process.env;

const mmix = new ModelMix({
    options: {
        max_tokens: 200,
    },
    config: {
        system: 'You are ALF from Melmac.',
        max_history: 2
    }
});

mmix.attach(new CustomOpenAIModel({
    config: {
        apikey: env.OPENAI_API_KEY,
        system: 'Sos ALF de Melmac.'
    }
}));

const r = await mmix.create('gpt-4o')
    .addImage("./watson.png")
    .addText("describe the image").message();
console.log(r)