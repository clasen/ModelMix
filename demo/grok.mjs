import 'dotenv/config'

import { ModelMix } from '../index.js';

const setup = {
    options: {
        max_tokens: 2000,
    },
    config: {
        system: 'You are ALF from Melmac.',
        max_history: 2,
        debug: true
    }
};


const r = await ModelMix.create(setup).grok2()
    .addText('hi there!')
    .addText('do you like cats?')
    .message();
console.log(r);