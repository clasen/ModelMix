import { ModelMix, MixGoogle } from '../index.js';
try { process.loadEnvFile(); } catch {}

const mmix = new ModelMix({
    options: {
        max_tokens: 2000,
    },
    config: {
        system: 'You are ALF from Melmac.',
        max_history: 2,
        debug: false
    }
});

// Using gemini25flash (Gemini 2.5 Flash) with built-in method
console.log("\n" + '--------| gemini25flash() |--------');
const flash = await mmix.gemini25flash()
    .addText('Hi there! Do you like cats?')
    .message();

console.log(flash);

// Using gemini3pro (Gemini 3 Pro) with custom config
console.log("\n" + '--------| gemini3pro() with JSON response |--------');
const pro = mmix.new().gemini3pro();

pro.addText('Give me a fun fact about cats');
const jsonResponse = await pro.json({ 
    fact: 'A fun fact about cats',
    category: 'animal behavior' 
});

console.log(jsonResponse);

// Using attach method with MixGoogle for custom model
console.log("\n" + '--------| Custom Gemini with attach() |--------');
mmix.attach('gemini-2.5-flash', new MixGoogle());

const custom = await mmix.addText('Tell me a short joke about cats.').message();
console.log(custom);

