import { ModelMix } from '../index.js';
try { process.loadEnvFile(); } catch { }

async function main() {
    try {
        const ai = ModelMix.new();

        const response = await ai.effort(50)
            .deepseekV4Flash()
            .addText('What is the capital of France?')
            .message();

        console.log(response);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
