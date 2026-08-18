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
    .gemini37flash() // (fallback 2) Google gemini-3.7-flash
    .gpt41nano() // (fallback 3) OpenAI gpt-4.1-nano
    .grok46() // (fallback 4) Grok grok-4.6
    .qwen35397b() // (fallback 5) OpenRouter qwen/qwen3.5-397b-a17b
    .hermes470b() // (fallback 6) OpenRouter nousresearch/hermes-4-70b
    .hermes4405b() // (fallback 7) OpenRouter nousresearch/hermes-4-405b
    .addText("What's your name?");

console.log(await mmix.message());
