import { ModelMix, MixGoogle } from '../dist/index.js';
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

// Using Gemini 4 Argon with high thinking effort
console.log("\n" + '--------| chain(\'gemini4argon@high\') |--------');
const argon = await mmix.new().chain('gemini4argon@high')
    .addText('In one sentence, why do cats knock things off tables?')
    .message();

console.log(argon);

// Using Gemini 4 Carbon with high thinking effort
console.log("\n" + '--------| chain(\'gemini4carbon@high\') |--------');
const carbon = await mmix.new().chain('gemini4carbon@high')
    .addText('In one sentence, why do cats knock things off tables?')
    .message();

console.log(carbon);

// Using Gemini 3.7 Flash with custom config
console.log("\n" + '--------| gemini37flash() with JSON response |--------');
const pro = mmix.new().gemini37flash();

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
