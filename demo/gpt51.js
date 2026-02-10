process.loadEnvFile();
import { ModelMix } from '../index.js';

const mmix = new ModelMix({
    config: {
        debug: 3,
    }
});

console.log("\n" + '--------| gpt51() |--------');

const gptArgs = { options: { reasoning_effort: "none", verbosity: "low" } };  
const gpt = mmix.gpt51(gptArgs);

gpt.addText("Explain quantum entanglement in simple terms.");
const response = await gpt.message();

console.log(response);

