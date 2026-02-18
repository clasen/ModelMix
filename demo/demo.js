process.loadEnvFile();
import { ModelMix } from '../index.js';

const mmix = new ModelMix({
    options: {
        temperature: 0.5,
    },
    config: {
        system: 'You are {name} from Melmac.',
        max_history: 2,
        bottleneck: { maxConcurrent: 1 },
        debug: 3,
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

console.log("\n" + '--------| gpt51() |--------');
const gptArgs = { options: { reasoning_effort: "none", verbosity: "low" } };
const gpt = mmix.gpt51(gptArgs).addText("Have you ever eaten a {animal}?");
gpt.replace({ '{animal}': 'cat' });
await gpt.json({ time: '24:00:00', message: 'Hello' }, { time: 'Time in format HH:MM:SS' });

console.log("\n" + '--------| sonnet45() |--------');
const claude = mmix.new({ config: { debug: 2 } }).sonnet45();
claude.addImageFromUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC');
claude.addText('in one word, which is the main color of the image?');
const imageDescription = await claude.message();
console.log(imageDescription);

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
