process.loadEnvFile();
import { ModelMix } from '../index.js';

const mmix = new ModelMix({
    config: {
        debug: true,
    }
});

console.log("\n" + '--------| gpt51() |--------');
const gpt = mmix.gpt51({ 
    config: { 
        reasoning: {
            effort: "low",
            summary: "auto"
        }
    } 
});

gpt.addText("Explain quantum entanglement in simple terms.");
const response = await gpt.message();

console.log(response);

