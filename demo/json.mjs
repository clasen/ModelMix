import 'dotenv/config'
import { ModelMix } from '../index.js';

const model = await ModelMix.new({ config: { debug: true } })
    .scout({ config: { temperature: 0 } })    
    .o4mini()
    .sonnet37think()
    .gpt45()
    .gemini25flash()
    .addText("Name and capital of 3 South American countries.")

const jsonResult = await model.json({ countries: [{ name: "", capital: "" }] });
console.log(jsonResult);