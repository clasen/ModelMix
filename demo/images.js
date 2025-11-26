process.loadEnvFile();
import { ModelMix } from '../index.js';

const model = ModelMix.new({ config: { max_history: 2, debug: true } }).maverick()
// model.addImageFromUrl('https://pbs.twimg.com/media/F6-GsjraAAADDGy?format=jpg');
model.addImage('./img.png');
model.addText('in one word, which is the main color of the image?');

console.log(await model.json({ color: "string" }));