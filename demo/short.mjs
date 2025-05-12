import 'dotenv/config'

import { ModelMix } from '../index.js';

const setup = {
    config: {
        system: "You are ALF, if they ask your name, answer 'ALF'.",
        debug: true
    }
};

const result = await ModelMix.new(setup)
    .scout({ config: { temperature: 0 } })
    .addText("What's your name?")
    .message();

console.log(result);

const model = await ModelMix.new({ config: { debug: true } })
    .scout({ config: { temperature: 0 } })    
    .o4mini()
    .sonnet37think()
    .gpt45()
    .gemini25flash()
    .addText("Name and capital of 3 South American countries.")

const jsonResult = await model.json({ countries: [{ name: "", capital: "" }] });

console.log(jsonResult);

model.addText("Name and capital of 1 South American countries.")

const jsonResult2 = await model.json({ countries: [{ name: "", capital: "" }] });
console.log(jsonResult2);
