import { ModelMix } from '../index.js';
try { process.loadEnvFile(); } catch {}

const model = await ModelMix.new({ options: { max_tokens: 10000 }, config: { debug: 3 } })
    .sonnet46()
    // .gptOss()
    // .scout({ config: { temperature: 0 } })    
    // .o4mini()
    // .sonnet37think()
    // .gpt45()
    // .gemini25flash()
    .addText("Name and capital of 3 South American countries.")

const jsonResult = await model.json([{
    name: "Argentina",
    capital: "BUENOS AIRES"
}, {
    name: "Brazil",
    capital: "BRASILIA"
}, {
    name: "Colombia",
    capital: "BOGOTA"
}], [{
    name: { description: "name of the country", enum: ["Perú", "Colombia", "Argentina"] },
    capital: "capital of the country in uppercase"
}], { addNote: true });

console.log(jsonResult);
console.log(model.lastRaw.tokens);