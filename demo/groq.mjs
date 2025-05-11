import 'dotenv/config'

import { ModelMix, MixGroq } from '../index.js';

const env = process.env;

const mmix = new ModelMix({
    options: {
        max_tokens: 2000,
    },
    config: {
        system: 'You are ALF from Melmac.',
        max_history: 2
    }
});

mmix.attach('deepseek-r1-distill-llama-70b', new MixGroq({
    config: {
        apiKey: env.GROQ_API_KEY,
    }
}));

const r = await mmix.addText('do you like cats?').message();
console.log(r)