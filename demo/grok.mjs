import 'dotenv/config'

import { ModelMix, MixGrok, MixAnthropic, MixOpenAI } from '../index.js';

const mmix = new ModelMix({
    options: {
        max_tokens: 2000,
    },
    config: {
        system: 'You are ALF from Melmac.',
        max_history: 2
    }
});

mmix.attach(new MixGrok(), new MixAnthropic(), new MixOpenAI());

const r = await mmix.create(['claude-3-7-sonnet-20250219', 'o3-mini', 'grok-2-latest']).addText('do you like cats?').message();
console.log(r);