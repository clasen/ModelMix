import 'dotenv/config'

import { ModelMix } from '../index.js';

const setup = {
    config: {
        system: "You are ALF, if they ask your name, answer 'ALF'.",
        debug: true
    }
};

const result = await ModelMix.create(setup)
    .sonnet37think()
    .o4mini({ config: { temperature: 0 } })
    .gpt41nano()
    .grok3mini()
    .gemini25flash()
    .addText("What's your name?")
    .message();

console.log(result);

const jsonResult = await ModelMix.create({ config: { debug: false } })
    .sonnet37()
    .addText("Name and capital of 3 South American countries.")
    .json({ countries: [{ name: "", capital: "" }] });

console.log(jsonResult);