import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
process.loadEnvFile(join(__dirname, '../.env'));
import { ModelMix } from '../index.js';

const ai = ModelMix.new({ config: { debug: true } })
    .gptOss()
    .kimiK2()
    .deepseekR1()
    .hermes3()
    .addText('What is the capital of France?');

const response = await ai.message();
console.log('Response from Claude via OpenRouter:', response);


