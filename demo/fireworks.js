process.loadEnvFile();
import { ModelMix } from '../index.js';

async function main() {
    try {
        const ai = ModelMix.new();

        const response = await ai
            .GLM46()
            .deepseekV32()
            .GLM47()
            .addText('What is the capital of France?')
            .message();

        console.log(response);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();

