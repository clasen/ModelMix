import { ModelMix, MixGoogle } from '../index.js';
try { process.loadEnvFile(); } catch { }

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

// Using Gemini 3.8 Flash with the built-in method
console.log("\n" + '--------| gemini38flash() |--------');
const flash = await mmix.gemini38flash()
    .addText('Hi there! Do you like cats?')
    .message();

console.log(flash);

// Using Gemini 3.1 Pro with custom config
console.log("\n" + '--------| gemini31pro() with JSON response |--------');
const pro = mmix.new().gemini31pro();

pro.addText('Give me a fun fact about cats');

const jsonExampleAndSchema = {
    fact: 'A fun fact about cats',
    category: 'animal behavior'
};

const jsonResponse = await pro.json(jsonExampleAndSchema, jsonExampleAndSchema);

console.log(jsonResponse);

// Using attach method with MixGoogle for custom model
console.log("\n" + '--------| Custom Gemini with attach() |--------');
const customModel = mmix.new().attach('gemini-2.5-flash', new MixGoogle());

const custom = await customModel.addText('Tell me a short joke about cats.').message();
console.log(custom);
