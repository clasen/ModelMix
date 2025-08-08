import 'dotenv/config';
import { ModelMix, MixOpenAI, MixAnthropic, MixPerplexity, MixOllama } from '../index.js';


const mmix = new ModelMix({
    options: {
        temperature: 0.5,
    },
    config: {
        // system: 'You are {name} from Melmac.',
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

console.log("\n" + '--------| gpt5nano() |--------');
const gpt = mmix.gpt5nano({ options: { temperature: 0 } }).addText("Have you ever eaten a {animal}?");
gpt.replace({ '{animal}': 'cat' });
console.log(await gpt.json({ time: '24:00:00', message: 'Hello' }, { time: 'Time in format HH:MM:SS' }));

console.log("\n" + '--------| sonnet4() |--------');
const claude = mmix.new({ config: { debug: true } }).sonnet4();
claude.addImageFromUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC');
claude.addText('in one word, which is the main color of the image?');
const imageDescription = await claude.message();
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
