import { ModelMix } from '../index.js';
try { process.loadEnvFile(); } catch {}

console.log("\n" + '--------| gpt54() prompt cache |--------');

// Keep the reusable prefix first and only vary the question at the end.
const sharedPrefix = [
    "You are a concise science tutor.",
    "The repeated block below is intentionally long so OpenAI can reuse cached prompt tokens on the second request.",
    Array.from({ length: 80 }, (_, index) =>
        `Reference ${String(index + 1).padStart(3, '0')}: Quantum systems are described with probabilities, measurements collapse possibilities into outcomes, and explanations must stay concrete, brief, and easy to understand.`
    ).join("\n")
].join("\n\n");

const buildPrompt = (question) => `${sharedPrefix}\n\nQuestion: ${question}`;

const createModel = () => ModelMix.new({
    config: {
        debug: 3,
    }
}).gpt54({
    options: {
        reasoning_effort: "none",
        verbosity: "low",
        prompt_cache_key: "demo-gpt54-prompt-cache",
        prompt_cache_retention: "24h"
    }
});

const runRequest = async (label, question) => {
    const model = createModel();
    model.addText(buildPrompt(question));

    const result = await model.raw();

    console.log(`\n${label}`);
    console.log("message:", result.message);
    console.log("tokens:", result.tokens);

    return result;
};

await runRequest(
    "Request 1 (warms the cache)",
    "Explain quantum entanglement in simple Spanish in 3 short bullet points."
);

await runRequest(
    "Request 2 (reuses the cached prefix)",
    "Now explain quantum entanglement in simple Spanish with a different analogy and 3 short bullet points."
);

