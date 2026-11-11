import { ModelMix } from '../dist/index.js';
try { process.loadEnvFile(); } catch {}

const ai = ModelMix.new({ config: { debug: 2 } })
    .kimiK27Code()
    .GLM52()
    .addText('What is the capital of France?');

const response = await ai.message();
console.log('Response from chained multi-provider models:', response);
