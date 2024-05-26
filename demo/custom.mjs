import 'dotenv/config'

import { ModelMix, MixCustom } from '../index.js';

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

mmix.attach(new MixCustom({
    config: {
        url: 'https://api.perplexity.ai/chat/completions',
        prefix: ["pplx", "llama", "mixtral"],
    },
    headers: {
        'authorization': `Bearer ${env.PPLX_API_KEY}`
    }
}));

const r = await mmix.create('pplx-70b-online').addText('do you like cats?').message()
console.log(r)