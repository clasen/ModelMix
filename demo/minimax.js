import { ModelMix } from '../index.js';
try { process.loadEnvFile(); } catch {}

const main = async () => {

    const bot = ModelMix
        .new({ config: { debug: 3 } })
        .minimaxM25()
        .setSystem('You are a helpful assistant.');

    bot.addText('What is the capital of France?');

    const all = await bot.raw();

    console.log('\n=== RESPONSE ===');
    console.log(all);
}

main().catch(console.error);

