import 'dotenv/config';
import { ModelMix, MixOpenAI, MixAnthropic, MixPerplexity, MixOllama } from '../index.js';

const mmix = new ModelMix({
    options: {
        max_tokens: 200,
    },
    config: {
        system: 'You are {name} from Melmac.',
        max_history: 2,
        max_request: 1,
    }
});

mmix.attach(new MixOpenAI());
mmix.attach(new MixAnthropic());
mmix.attach(new MixPerplexity({
    config: {
        apiKey: process.env.PPLX_API_KEY
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

mmix.replace({ '{name}': 'ALF' });

console.log("\n" + '--------| gpt-4o |--------');
const gpt = mmix.create('gpt-4o', { temperature: 0.5 }).addText("Have you ever eaten a {animal}?");
gpt.replace({ '{animal}': 'cat' });
console.log(await gpt.message());

console.log("\n" + '--------| claude-3-5-sonnet-20240620 |--------');
const claude = mmix.create('claude-3-5-sonnet-20240620', { temperature: 0.5 });
claude.addImage('./watson.jpg');
const imageDescription = await claude.addText('describe the image').message();
console.log(imageDescription);

console.log("\n" + '--------| llama-3-sonar-large-32k-online |--------');
const pplx = mmix.create('llama-3-sonar-large-32k-online', { max_tokens: 500 });
pplx.addText('How much is ETH trading in USD?');
const news = await pplx.addText('What are the 3 most recent Ethereum news?').message();
console.log(news);

console.log("\n" + '--------| ollama (llava:latest) |--------');
await mmix.create('llava:latest')
    .addImage('./watson.jpg')
    .addText('what is the predominant color?')
    .stream((data) => { console.log(data.message); });
