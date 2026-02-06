process.loadEnvFile();
import { ModelMix } from '../index.js';

const ai = ModelMix.new({ config: { debug: 2 } })
    .gptOss()
    .kimiK2()
    .deepseekR1()
    .hermes3()
    .addText('What is the capital of France?');

const response = await ai.message();
console.log('Response from Claude via OpenRouter:', response);


