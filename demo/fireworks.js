import { ModelMix, MixFireworks } from '../index.js';
try { process.loadEnvFile(); } catch { }

async function main() {
    try {
        const ai = ModelMix.new().attach(
            'accounts/martin-clasen-497c5b/deployments/u7ocooxr',
            new MixFireworks()
        );

        const response = await ai
            .addText('What is the capital of France?')
            .message();

        console.log(response);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
