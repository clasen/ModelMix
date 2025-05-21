import 'dotenv/config'

import { ModelMix } from '../index.js';

const setup = {
    config: {
        system: "You are ALF, if they ask your name, answer 'ALF'.",
        debug: true
    }
};

const mmix = await ModelMix.new(setup)
    .sonnet37think() // (main model) Anthropic claude-3-7-sonnet-20250219
    .o4mini() // (fallback 1) OpenAI o4-mini
    .gemini25proExp({ config: { temperature: 0 } }) // (fallback 2) Google gemini-2.5-pro-exp-03-25
    .gpt41nano() // (fallback 3) OpenAI gpt-4.1-nano
    .grok3mini() // (fallback 4) Grok grok-3-mini-beta
    .addText("What's your name?");

console.log(await mmix.message());