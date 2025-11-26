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

mmix.sonnet37({ config: { url: 'fail' } }).gpt41nano();

async function main() {
    mmix.addText('hola, como estas?');
    const response = await mmix.message();
    console.log(response);
}

main();