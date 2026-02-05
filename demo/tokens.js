process.loadEnvFile();
import { ModelMix } from '../index.js';

console.log('\n🔢 Token Usage Tracking Demo\n');
console.log('='.repeat(60));

// Example 1: Get token usage from a simple request
console.log('\n📝 Example 1: Basic token usage tracking');
console.log('-'.repeat(60));

const model1 = ModelMix.new({ config: { debug: 1 } })
    .gpt5nano()
    .addText('What is 2+2?');

const result1 = await model1.raw();
console.log('\n📊 Token Usage:');
console.log('  Input tokens:', result1.tokens.input);
console.log('  Output tokens:', result1.tokens.output);
console.log('  Total tokens:', result1.tokens.total);
console.log('\n💬 Response:', result1.message);

// Example 2: Compare token usage across different providers
console.log('\n\n📝 Example 2: Token usage across providers');
console.log('-'.repeat(60));

const providers = [
    { name: 'OpenAI GPT-5-nano', fn: (m) => m.gpt5nano() },
    { name: 'Anthropic Haiku', fn: (m) => m.haiku35() },
    { name: 'Google Gemini', fn: (m) => m.gemini25flash() }
];

const prompt = 'Explain quantum computing in one sentence.';

for (const provider of providers) {
    try {
        const model = ModelMix.new({ config: { debug: 0 } });
        provider.fn(model).addText(prompt);
        
        const result = await model.raw();
        
        console.log(`\n🤖 ${provider.name}`);
        console.log(`  Input: ${result.tokens.input} | Output: ${result.tokens.output} | Total: ${result.tokens.total}`);
        console.log(`  Response: ${result.message.substring(0, 80)}...`);
    } catch (error) {
        console.log(`\n❌ ${provider.name}: ${error.message}`);
    }
}

// Example 3: Track tokens in a conversation
console.log('\n\n📝 Example 3: Token usage in conversation history');
console.log('-'.repeat(60));

const conversation = ModelMix.new({ config: { debug: 0, max_history: 10 } })
    .gpt5nano();

let totalInput = 0;
let totalOutput = 0;

// First message
conversation.addText('Hi! My name is Alice.');
let result = await conversation.raw();
totalInput += result.tokens.input;
totalOutput += result.tokens.output;
console.log(`\n💬 Turn 1: ${result.tokens.input} in, ${result.tokens.output} out`);

// Second message (includes history)
conversation.addText('What is my name?');
result = await conversation.raw();
totalInput += result.tokens.input;
totalOutput += result.tokens.output;
console.log(`💬 Turn 2: ${result.tokens.input} in, ${result.tokens.output} out`);

// Third message (includes more history)
conversation.addText('Tell me a joke about my name.');
result = await conversation.raw();
totalInput += result.tokens.input;
totalOutput += result.tokens.output;
console.log(`💬 Turn 3: ${result.tokens.input} in, ${result.tokens.output} out`);

console.log('\n📊 Conversation totals:');
console.log(`  Total input tokens: ${totalInput}`);
console.log(`  Total output tokens: ${totalOutput}`);
console.log(`  Grand total: ${totalInput + totalOutput}`);

// Example 4: JSON response with token tracking
console.log('\n\n📝 Example 4: JSON response with token tracking');
console.log('-'.repeat(60));

const jsonModel = ModelMix.new({ config: { debug: 0 } })
    .gpt5nano()
    .addText('List 3 programming languages');

const jsonResult = await jsonModel.json(
    { languages: [{ name: '', year: 0 }] }
);

// Get raw result for token info
const rawJsonModel = ModelMix.new({ config: { debug: 0 } })
    .gpt5nano()
    .addText('List 3 programming languages');

const rawJsonResult = await rawJsonModel.raw();

console.log('\n📊 Token Usage for JSON response:');
console.log(`  Input: ${rawJsonResult.tokens.input} | Output: ${rawJsonResult.tokens.output} | Total: ${rawJsonResult.tokens.total}`);
console.log('\n📋 JSON Result:', jsonResult);

console.log('\n' + '='.repeat(60));
console.log('✅ Token tracking demo complete!\n');
