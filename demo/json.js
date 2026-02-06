process.loadEnvFile();
import { ModelMix } from '../index.js';

const model = await ModelMix.new({ options: { max_tokens: 10000 }, config: { debug: 3 } })
    .gemini3flash()
    // .gptOss()
    // .scout({ config: { temperature: 0 } })    
    // .o4mini()
    // .sonnet37think()
    // .gpt45()
    // .gemini25flash()
    .addText("Name and capital of 3 South American countries.")

const jsonResult = await model.json({
    countries: [{
        name: "Argentina",
        capital: "BUENOS AIRES"
    }]
}, {
    countries: [{
        name: "name of the country",
        capital: "capital of the country in uppercase"
    }]
}, { addNote: true });

console.log(jsonResult);
console.log(model.lastRaw.tokens);