import { ModelMix } from '../index.js';
try { process.loadEnvFile(); } catch {}

// Ejemplo simple: obtener información de tokens
const model = ModelMix.new()
    .gpt61sol()
    .addText('What is 2+2?');

const result = await model.raw();

console.log('\n📊 Token Usage Information:');
console.log('━'.repeat(50));
console.log(`Input tokens:  ${result.tokens.input}`);
console.log(`Output tokens: ${result.tokens.output}`);
console.log(`Total tokens:  ${result.tokens.total}`);
console.log('━'.repeat(50));
console.log('\n💬 Response:', result.message);
console.log();
