import { ModelMix } from '../index.js';
process.loadEnvFile();



const main = async () => {

    const bot = ModelMix
        .new({ config: { debug: true } })
        .minimaxM21()
        .setSystem('You are a helpful assistant.');

    bot.addText('What is the capital of France?');

    const all = await bot.raw();

    console.log('\n=== RESPONSE ===');
    console.log(all);
}

main().catch(console.error);

