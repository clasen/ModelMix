import 'dotenv/config'

import { ModelMix, MixGroq } from '../index.js';

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

mmix.attach(new MixGroq({
    config: {
        apiKey: env.GROQ_API_KEY,
    }
}));

const r = await mmix.create('llama3-70b-8192').addText('do you like cats?').message();
console.log(r)