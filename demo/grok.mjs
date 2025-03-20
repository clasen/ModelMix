import 'dotenv/config'

import { ModelMix, MixGrok, MixAnthropic } from '../index.js';

const mmix = new ModelMix({
    options: {
        max_tokens: 2000,
    },
    config: {
        system: 'You are ALF from Melmac.',
        max_history: 2
    }
});

mmix.attach(new MixGrok());
mmix.attach(new MixAnthropic());

const r = await mmix.create(['grok-2-latest', 'claude-3-7-sonnet-20250219']).addText('do you like cats?').message();
console.log(r)