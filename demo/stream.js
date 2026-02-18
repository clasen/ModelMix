import { ModelMix } from '../index.js';
try { process.loadEnvFile(); } catch {}

await ModelMix.new().gpt41nano()
    .addImageFromUrl('https://pbs.twimg.com/media/F6-GsjraAAADDGy?format=jpg')
    .addText('describe')
    .stream((data) => { console.log(data.message); });

await ModelMix.new().haiku35()
    .addImageFromUrl('https://pbs.twimg.com/media/F6-GsjraAAADDGy?format=jpg')
    .addText('describe')
    .stream((data) => { console.log(data.message); });

await ModelMix.new().sonar()
    .addText('Who is the president of salvador?')
    .stream((data) => { console.log(data.message); });
