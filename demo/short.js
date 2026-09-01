import { ModelMix } from '../index.js';
try { process.loadEnvFile(); } catch {}

const setup = {
    config: {
        system: "You are ALF, if they ask your name, answer 'ALF'.",
        debug: 2
    }
};

const mmix = await ModelMix.new(setup)
    .fable51({ mix: { openrouter: true } }) // (main + provider fallback) Anthropic/OpenRouter Claude Fable 5.1
    .sonnet46() // (fallback 2) Anthropic claude-sonnet-4-6
    .gpt56luna({ mix: { openrouter: true } }) // (fallback 3 + provider fallback) OpenAI/OpenRouter gpt-5.6-luna
    .gemini37flash() // (fallback 4) Google gemini-3.7-flash
    .gpt5nano({ mix: { openrouter: true } }) // (fallback 5 + provider fallback) OpenAI/OpenRouter gpt-5-nano
    .grok46() // (fallback 6) Grok grok-4.6
    .qwen35397b() // (fallback 7) OpenRouter qwen/qwen3.5-397b-a17b
    .qwen3827b() // (fallback 8) OpenRouter qwen/qwen3.8-27b
    .qwen38flash() // (fallback 9) OpenRouter qwen/qwen3.8-flash
    .GLM53() // (fallback 10) OpenRouter z-ai/glm-5.3
    .GLM53Flash() // (fallback 11) OpenRouter z-ai/glm-5.3-flash
    .museGlimmer30b({ mix: { fireworks: false, openrouter: true } }) // (fallback 12) OpenRouter meta/muse-glimmer-30b
    .museSpark12Contributor() // (fallback 13) OpenRouter meta/muse-spark-1.2-contributor
    .hermes470b() // (fallback 14) OpenRouter nousresearch/hermes-4-70b
    .hermes4405b() // (fallback 15) OpenRouter nousresearch/hermes-4-405b
    .addText("What's your name?");

console.log(await mmix.message());
