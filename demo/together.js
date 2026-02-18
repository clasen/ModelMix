import { ModelMix, MixTogether } from '../index.js';
try { process.loadEnvFile(); } catch {}

const setup = { config: { system: "You are ALF from Melmac." } };

let r = ModelMix.new()
    .attach('deepseek-ai/DeepSeek-R1', new MixTogether(setup))
    .addText('hi there')
    .addText('do you like cats?')
    .message();

console.log(await r);