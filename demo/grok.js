import { ModelMix } from '../index.js';
try { process.loadEnvFile(); } catch {}

const mmix = new ModelMix({
    options: {
        max_tokens: 2000,
    },
    config: {
        system: 'You are ALF from Melmac.',
        max_history: 2,
        debug: 2
    }
});


const r = await mmix.grok4()
    .addText('hi there!')
    .addText('do you like cats?')
    .raw();

console.log(r);