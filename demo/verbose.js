process.loadEnvFile();
import { ModelMix, MixOpenAI } from '../index.js';

const prompt = "Say 'Hello World' in exactly 2 words.";

console.log('═══════════════════════════════════════════════════════════════');
console.log('DEMO: Verbose Modes in ModelMix');
console.log('═══════════════════════════════════════════════════════════════\n');


// ===================================================================
// VERBOSE LEVEL 0 - Silent Mode
// ===================================================================
console.log('─────────────────────────────────────────────────────────────');
console.log('1. VERBOSE LEVEL 0 - Silent Mode');
console.log('   No output at all, only the result');
console.log('─────────────────────────────────────────────────────────────\n');

await ModelMix
    .new({ config: { verbose: 0 } })
    .gpt41nano()
    .addText(prompt)
    .message();


// ===================================================================
// VERBOSE LEVEL 1 - Minimal Mode
// ===================================================================
console.log('─────────────────────────────────────────────────────────────');
console.log('2. VERBOSE LEVEL 1 - Minimal Mode');
console.log('   Shows: → [model] #N and ✓ Success');
console.log('─────────────────────────────────────────────────────────────\n');

await ModelMix
    .new({ config: { verbose: 1 } })
    .gpt41nano()
    .addText(prompt)
    .message();

// ===================================================================
// VERBOSE LEVEL 2 - Readable Summary (DEFAULT)
// ===================================================================
console.log('─────────────────────────────────────────────────────────────');
console.log('3. VERBOSE LEVEL 2 - Readable Summary (DEFAULT)');
console.log('   Shows: model, system prompt, input, message count, output');
console.log('   Everything in compact format on 2 lines');
console.log('─────────────────────────────────────────────────────────────\n');

await ModelMix
    .new({ config: { verbose: 2 } })
    .gpt41nano()
    .addText(prompt)
    .json({ message: 'string' });

// ===================================================================
// VERBOSE LEVEL 3 - Full Debug
// ===================================================================
console.log('─────────────────────────────────────────────────────────────');
console.log('4. VERBOSE LEVEL 3 - Full Debug Mode');
console.log('   Shows: everything from level 2 + raw response, full message,');
console.log('   request details, config, and options');
console.log('─────────────────────────────────────────────────────────────\n');

await ModelMix
    .new({ config: { verbose: 3 } })
    .gpt41nano()
    .addText(prompt)
    .message();

// ===================================================================
// FALLBACK EXAMPLE (with verbose 2)
// ===================================================================
console.log('─────────────────────────────────────────────────────────────');
console.log('5. FALLBACK EXAMPLE (Verbose Level 2)');
console.log('   Shows how fallback models are displayed');
console.log('─────────────────────────────────────────────────────────────\n');

try {
    const resultFallback = await ModelMix
        .new({ config: { verbose: 2 } })
        .attach('fake-model-that-will-fail', new MixOpenAI())
        .gpt41nano() // This will be the fallback
        .addText(prompt)
        .message();

    console.log(`Result: ${resultFallback}\n`);
} catch (error) {
    console.log(`Error (should not happen): ${error.message}\n`);
}


// ===================================================================
// SUMMARY
// ===================================================================
console.log('═══════════════════════════════════════════════════════════════');
console.log('DEMO COMPLETED');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log('Summary:');
console.log('  - Level 0: Silent, no logs');
console.log('  - Level 1: Minimal (→ model, ✓ Success)');
console.log('  - Level 2: Readable (1 line input + 1 line output) [DEFAULT]');
console.log('  - Level 3: Full debug (includes raw responses and configs)');
console.log('');
