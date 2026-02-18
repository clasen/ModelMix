import { ModelMix } from '../index.js';
import ivm from 'isolated-vm';
try { process.loadEnvFile(); } catch {}

console.log('🧬 ModelMix - IVM + mmix Callback Demo');

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES: Describe data for the model (without exposing raw content)
// ═══════════════════════════════════════════════════════════════════════════

function describeData(data, name = 'data') {
    const type = Array.isArray(data) ? 'array' : typeof data;

    if (Array.isArray(data)) {
        const itemDescriptions = data.map((item, i) => {
            if (typeof item === 'string') return `[${i}]: string, ${item.length} chars`;
            if (typeof item === 'object') return `[${i}]: object with keys [${Object.keys(item).join(', ')}]`;
            return `[${i}]: ${typeof item}`;
        });
        return `Variable '${name}' is an array with ${data.length} elements:\n  ${itemDescriptions.join('\n  ')}`;
    }

    if (typeof data === 'object' && data !== null) {
        const keys = Object.keys(data);
        return `Variable '${name}' is an object with keys: [${keys.join(', ')}]`;
    }

    if (typeof data === 'string') {
        return `Variable '${name}' is a string with ${data.length} characters`;
    }

    return `Variable '${name}' is of type ${type}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// IVM CONTEXT: Setup isolated environment with mmix callback
// ═══════════════════════════════════════════════════════════════════════════

async function createIvmContext(isolate, contextData, mmixInstance) {
    const context = await isolate.createContext();
    const jail = context.global;

    // Expose context data as variables
    for (const [key, value] of Object.entries(contextData)) {
        await jail.set(key, new ivm.ExternalCopy(value).copyInto());
    }

    // Expose mmix as async callback
    // The callback receives: system prompt, user message, and output schema (as JSON string)
    await jail.set('__mmixCallback', new ivm.Reference(async (system, message, outputJson) => {
        const output = JSON.parse(outputJson);
        const result = await mmixInstance.new()
            .gpt41nano()
            .setSystem(system)
            .addText(message)
            .json(output, output);
        return new ivm.ExternalCopy(JSON.stringify(result)).copyInto();
    }));

    // Create async wrapper for mmix inside the isolate
    await context.eval(`
        const mmix = {
            async query(system, message, output) {
                const outputJson = JSON.stringify(output);
                const resultJson = await __mmixCallback.apply(undefined, [system, message, outputJson], { result: { promise: true } });
                return JSON.parse(resultJson);
            }
        };
    `);

    return context;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN: Execute model-generated code in IVM with mmix access
// ═══════════════════════════════════════════════════════════════════════════

async function runIvmWithMmix({ task, contextData, model, maxChunkSize = 1500 }) {
    const isolate = new ivm.Isolate({ memoryLimit: 128 });

    try {
        // Build data description for the model
        const dataDescriptions = Object.entries(contextData)
            .map(([key, value]) => describeData(value, key))
            .join('\n');

        // System prompt explaining the environment
        const systemPrompt = `You are a code generator. You have access to an isolated JavaScript environment with:

AVAILABLE DATA:
${dataDescriptions}

AVAILABLE API:
- mmix.query(system, message, outputSchema): async function that calls an LLM. Returns a JSON object.
  - system: the system prompt for the LLM
  - message: the user message/query
  - outputSchema: object defining expected output structure (keys are variable names, values are descriptions)

EXAMPLES:
// Single query - translation
const result = await mmix.query(
    'You are a professional translator',
    'Translate to Spanish: Hello world',
    { translation: 'text translated to spanish' }
);
// Returns: { translation: 'Hola mundo' }

// Single query - summary with metadata
const summary = await mmix.query(
    'You are a summarizer',
    'Summarize: ' + text,
    { summary: 'brief summary of the text', wordCount: 'number of words in summary' }
);
// Returns: { summary: '...', wordCount: 42 }

// Parallel queries (recommended for multiple independent operations)
const results = await Promise.all([
    mmix.query('Translator', 'Translate to Spanish: ' + paragraphs[0], { translation: 'text translated to spanish' }),
    mmix.query('Translator', 'Translate to Spanish: ' + paragraphs[1], { translation: 'text translated to spanish' })
]);

// Combine results
return results.map(r => r.translation).join('\\n\\n');

PARALLEL PROCESSING RULES:
- When processing large texts in parallel, split into chunks of maximum ${maxChunkSize} characters
- Use Promise.all() to process all chunks simultaneously
- Example splitting a text:
  const chunkSize = ${maxChunkSize};
  const chunks = [];
  for (let i = 0; i < input.length; i += chunkSize) {
    chunks.push(input.substring(i, i + chunkSize));
  }
  const results = await Promise.all(
    chunks.map(chunk => mmix.query('System prompt', chunk, outputSchema))
  );
  return results.map(r => r.translation).join('');

IMPORTANT:
- Write an async IIFE that returns the final result directly (string, array, or simple object)
- mmix.query() returns JSON objects, extract the fields you need (e.g., result.translation)
- Use Promise.all for parallel operations when possible
- When splitting text, prefer to split at natural boundaries (paragraphs, sentences) when near the ${maxChunkSize} limit
- Return ONLY the code, no explanations or markdown`;

        model.setSystem(systemPrompt);

        // Request code generation
        const code = await model
            .addText(`Task: ${task}\n\nGenerate the JavaScript code. Return ONLY the async IIFE code, nothing else.`)
            .message();

        console.log('\n📄 Generated code:');
        console.log('─'.repeat(60));
        console.log(code);
        console.log('─'.repeat(60));

        // Create IVM context with data and mmix callback
        const context = await createIvmContext(isolate, contextData, model);

        // Execute the generated code (wrap in JSON.stringify for safe transfer)
        console.log('\n⚡ Executing in IVM...');
        const wrappedCode = `(async () => {
            const __result = await ${code};
            return JSON.stringify(__result);
        })()`;

        const resultJson = await context.eval(wrappedCode, {
            timeout: 60000,  // 60s timeout for LLM calls
            promise: true
        });

        // Parse result (handle both primitives and objects)
        try {
            return JSON.parse(resultJson);
        } catch {
            return resultJson;
        }

    } finally {
        isolate.dispose();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEMO: Summarize paragraphs example
// ═══════════════════════════════════════════════════════════════════════════

async function demo() {
    console.log('\n=== Demo: Summarize Paragraphs via IVM + mmix ===\n');

    // Sample data: 3 paragraphs (the model won't see the content, only metadata)
    const paragraphs = [
        `Artificial intelligence has transformed numerous industries over the past decade. From healthcare diagnostics to autonomous vehicles, AI systems now perform tasks that were once thought to require human intelligence. Machine learning algorithms can analyze vast amounts of data, identify patterns, and make predictions with remarkable accuracy.`,

        `Climate change represents one of the most pressing challenges facing humanity today. Rising global temperatures are causing more frequent extreme weather events, melting polar ice caps, and threatening biodiversity across the planet. Scientists warn that immediate action is needed to reduce greenhouse gas emissions and transition to renewable energy sources.`,

        `The evolution of remote work has fundamentally changed how businesses operate. Companies have discovered that distributed teams can be highly productive while offering employees better work-life balance. However, this shift also presents challenges in maintaining company culture, ensuring effective communication, and managing across different time zones.`,

        `Artificial intelligence has transformed numerous industries over the past decade. From healthcare diagnostics to autonomous vehicles, AI systems now perform tasks that were once thought to require human intelligence. Machine learning algorithms can analyze vast amounts of data, identify patterns, and make predictions with remarkable accuracy.`,

        `Climate change represents one of the most pressing challenges facing humanity today. Rising global temperatures are causing more frequent extreme weather events, melting polar ice caps, and threatening biodiversity across the planet. Scientists warn that immediate action is needed to reduce greenhouse gas emissions and transition to renewable energy sources.`,

        `The evolution of remote work has fundamentally changed how businesses operate. Companies have discovered that distributed teams can be highly productive while offering employees better work-life balance. However, this shift also presents challenges in maintaining company culture, ensuring effective communication, and managing across different time zones.`


    ];

    // Create base mmix instance for the callbacks
    const model = ModelMix.new({ config: { debug: 2, bottleneck: {} } })
        .gpt52({ options: { reasoning_effort: 'none', verbosity: null } })
        .gpt41nano()
        .gemini3flash();

    // Run the IVM task
    const result = await runIvmWithMmix({
        task: 'Translate each paragraph to latin spanish, then return all joined by double newlines.',
        contextData: { paragraphs },
        model
    });

    console.log('\n✅ Final result from IVM:');
    console.log('═'.repeat(60));
    console.log(result);
    console.log('═'.repeat(60));

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN
// ═══════════════════════════════════════════════════════════════════════════

try {
    await demo();
    console.log('\n✅ Demo completed successfully');
} catch (error) {
    console.error('❌ Error:', error);
}
