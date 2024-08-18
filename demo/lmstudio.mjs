import { ModelMix, MixLMStudio } from '../index.js';

const mmix = new ModelMix({
    options: {
        max_tokens: -1,
    },
    config: {
        max_history: 2,
        bottleneck: { maxConcurrent: 1 },
    }
});

const model = new MixLMStudio({
    config: {
        prefix: ['Orenguteng'],
    },
    options: {
        repeat_penalty: 1,
    }
});
console.log(model.config)

mmix.attach(model);


const LMS = mmix.create('Orenguteng/Llama-3-8B-Lexi-Uncensored-GGUF');
console.log(await LMS
    .addImage('./watson.jpg')
    .addText('describir')
    .message());