import 'dotenv/config'

import { ModelMix, CustomPerplexityModel } from '../index.js';

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

mmix.attach(new CustomPerplexityModel({
    config: {
        apikey: env.PPLX_API_KEY,
    }
}));

const r = await mmix.create('pplx-70b-online').addText('te gustan los gatos?').message()
console.log(r)