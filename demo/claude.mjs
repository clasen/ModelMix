import 'dotenv/config'

import { ModelMix, CustomAnthropicModel } from '../index.js';

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

mmix.attach(new CustomAnthropicModel({
    config: {
        apikey: env.ANTHROPIC_API_KEY,
    },
}));

const r = await mmix.create('claude-3-haiku-20240307')
    .addImage("./watson.png")
    .addText("describe the image").message();

console.log(r)