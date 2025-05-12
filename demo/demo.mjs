import 'dotenv/config';
import { ModelMix, MixOpenAI, MixAnthropic, MixPerplexity, MixOllama } from '../index.js';


const mmix = new ModelMix({
    options: {
        max_tokens: 200,
        temperature: 0.5,
    },
    config: {
        system: 'You are {name} from Melmac.',
        max_history: 2,
        bottleneck: { maxConcurrent: 1 },
        debug: true,
    }
});


const pplxSettings = {
    config: {
        apiKey: process.env.PPLX_API_KEY,
        system: 'You are my personal assistant.',
        max_tokens: 500
    }
};


mmix.replace({ '{name}': 'ALF' });

console.log("\n" + '--------| gpt-4.1-nano |--------');
const gpt = mmix.attach('gpt-4.1-nano', new MixOpenAI({ options: { temperature: 0 } })).addText("Have you ever eaten a {animal}?");
gpt.replace({ '{animal}': 'cat' });
console.log(await gpt.json({ time: '24:00:00', message: 'Hello' }, { time: 'Time in format HH:MM:SS' }));

console.log("\n" + '--------| claude-3-5-sonnet-20240620 |--------');
const claude = ModelMix.new().attach('claude-3-5-sonnet-20240620', new MixAnthropic());
claude.addImageFromUrl('https://pbs.twimg.com/media/F6-GsjraAAADDGy?format=jpg');
const imageDescription = await claude.addText('describe the image').message();
console.log(imageDescription);

console.log("\n" + '--------| claude-3-7-sonnet-20250219 |--------');
const writer = ModelMix.new().attach('claude-3-7-sonnet-20250219', new MixAnthropic());
writer.setSystem('You are a writer like Stephen King');
writer.replaceKeyFromFile('{story_title}', './title.md');
const story = await writer.addTextFromFile('./prompt.md').message();
console.log(story);

console.log("\n" + '--------| sonar |--------');
const pplx = ModelMix.new().sonar(pplxSettings);
pplx.addText('How much is ETH trading in USD?');
const ETH = await pplx.json({ price: 1000.1 });
console.log(ETH.price);

// console.log("\n" + '--------| ollama (llava:latest) |--------');
// await mmix.new().attach('llava:latest', new MixOllama())
//     .addImage('./watson.jpg')
//     .addText('what is the predominant color?')
//     .stream((data) => { console.log(data.message); });
