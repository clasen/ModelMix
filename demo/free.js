import { ModelMix } from '../index.js';
try { process.loadEnvFile(); } catch {}

const ai = ModelMix.new({ config: { debug: 2 }, mix: { openrouter: false } })
    .gptOss()
    .kimiK25()
    .hermes3()
    .addText('What is the capital of France?');

const response = await ai.message();
console.log('Response from a free-tier provider:', response);

