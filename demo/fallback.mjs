import { ModelMix, MixOpenAI, MixAnthropic, MixGrok } from '../index.js';
import dotenv from 'dotenv';
dotenv.config();

const mmix = new ModelMix({
    config: {
        max_history: 1,
        debug: false,
        bottleneck: {
            minTime: 15000,
            maxConcurrent: 1
        }
    },
    options: {
        max_tokens: 8192,
    }
});
const an = new MixAnthropic();
an.config.url = 'fail';
mmix.attach(new MixOpenAI(), an, new MixGrok());


const modelOptionsRef = ['claude-3-5-sonnet-20241022', 'gpt-4.1-nano'];

async function main() {
    const response = await generateThread(modelOptionsRef);
    console.log(response);
}

async function generateThread(modelOptionsRef) {
    const model = mmix.create(modelOptionsRef, { options: { temperature: 0.5 } });
    model.addText('hola, como estas?');
    const response = await model.message();

    return response.split('---').map(section => section.trim());
}

main();