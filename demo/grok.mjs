import 'dotenv/config'

import { ModelMix } from '../index.js';

const mmix = new ModelMix({
    options: {
        max_tokens: 2000,
    },
    config: {
        system: 'You are ALF from Melmac.',
        max_history: 2,
        debug: true
    }
});


const r = await mmix.grok3mini()
    .addText('hi there!')
    .addText('do you like cats?')
    .raw();
console.log(r);