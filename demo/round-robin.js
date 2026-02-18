import { ModelMix } from '../index.js';
try { process.loadEnvFile(); } catch {}

console.log('\n=== Round Robin Simple Demo ===\n');

// Create instance with round robin enabled
const ai = ModelMix.new({ 
    config: { 
        debug: 2, // Show which model is being used
        roundRobin: true 
    },
    mix: { openrouter: false } // Exclude OpenRouter (free tier often rate-limited)
})
    .gptOss();

console.log('Making 6 requests with round robin enabled...\n');

// Make 6 requests to see rotation through all models (cerebras + groq)
for (let i = 1; i <= 6; i++) {
    const result = await ai.new()
        .addText(`Calculate ${i} * 2`)
        .message();
    console.log(`  Result: ${result.trim()}\n`);
}

console.log('✓ Demo completed!\n');
