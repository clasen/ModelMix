import 'dotenv/config'

import { ModelMix, MixCerebras } from '../index.js';

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

mmix.attach(new MixCerebras());

let r = mmix.create('llama-4-scout-17b-16e-instruct').addText('hi there');
r = await r.addText('do you like cats?').message();
console.log(r);