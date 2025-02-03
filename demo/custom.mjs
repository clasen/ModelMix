import 'dotenv/config'

import { ModelMix, MixCustom, MixTogether } from '../index.js';

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

mmix.attach(new MixTogether());

let r = mmix.create('deepseek-ai/DeepSeek-R1').addText('hi there');
r = await r.addText('do you like cats?').message();
console.log(r);