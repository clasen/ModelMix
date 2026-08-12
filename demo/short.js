import { ModelMix } from '../index.js';
try { process.loadEnvFile(); } catch {}

const setup = {
    config: {
        system: "You are ALF, if they ask your name, answer 'ALF'.",
        debug: 2
    }
};

const mmix = await ModelMix.new(setup)
    .sonnet46() // (main model) Anthropic claude-sonnet-4-6
    .gpt56luna() // (fallback 1) OpenAI gpt-5.6-luna
    .gemini36flash({ config: { temperature: 0 } }) // (fallback 2) Google gemini-3.6-flash
    .gpt41nano() // (fallback 3) OpenAI gpt-4.1-nano
    .grok46() // (fallback 4) Grok grok-4.6
    .addText("What's your name?");

console.log(await mmix.message());
