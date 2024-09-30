import 'dotenv/config'

import { ModelMix, MixTogether } from '../index.js';

const env = process.env;

const mmix = new ModelMix({
    options: {
        max_tokens: 200,
    },
    config: {
        system: 'You are ALF from Melmac.',
        max_history: 2,
        debug: true
    }
});

mmix.attach(new MixTogether());

let r = mmix.create('NousResearch/Hermes-3-Llama-3.1-405B-Turbo')
    .addText('hi there')
    .addText('do you like cats?')
    .message();

console.log(r);