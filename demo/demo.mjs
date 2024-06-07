import 'dotenv/config';
import { ModelMix, MixOpenAI, MixAnthropic, MixPerplexity, MixOllama } from '../index.js';

const env = process.env;

const mmix = new ModelMix({
    options: {
        max_tokens: 200,
    },
    config: {
        system: 'You are ALF from Melmac.',
        max_history: 2,
        max_request: 1,
    }
});


mmix.attach(new MixOpenAI({ config: { apiKey: env.OPENAI_API_KEY } }));
mmix.attach(new MixAnthropic({ config: { apiKey: env.ANTHROPIC_API_KEY } }));
mmix.attach(new MixPerplexity({
    config: {
        apiKey: env.PPLX_API_KEY
    },
    system: 'You are my personal assistant.'
}));
mmix.attach(new MixOllama({
    config: {
        prefix: ['llava'],
    },
    options: {
        temperature: 0.5,
    }
}));


console.log("\n" + '--------| gpt-4o |--------');
const gpt = mmix.create('gpt-4o', { temperature: 0.5 }).addText("Have you ever eaten a cat?");
console.log(await gpt.message());

console.log("\n" + '--------| claude-3-sonnet-20240229 |--------');
const claude = mmix.create('claude-3-sonnet-20240229', { temperature: 0.5 });
claude.addImage('./watson.png');
const imageDescription = await claude.addText('describe the image').message();
console.log(imageDescription);

console.log("\n" + '--------| pplx-70b-online |--------');
const pplx = mmix.create('pplx-70b-online', { max_tokens: 500 });
pplx.addText('How much is ETH trading in USD?');
const news = await pplx.addText('What are the 3 most recent Ethereum news?').message();
console.log(news);

console.log("\n" + '--------| ollama (llava:latest) |--------');
await mmix.create('llava:latest')
    .addImage('./watson.png')
    .addText('what is the predominant color?')
    .stream((data) => { console.log(data.message); });
