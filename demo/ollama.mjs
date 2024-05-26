import { ModelMix, MixOllama } from '../index.js';

const mmix = new ModelMix({
    options: {
        max_tokens: 200,
    },
    config: {
        max_history: 2
    }
});

mmix.attach(new MixOllama({
    config: {
        url: 'http://localhost:11434/api/chat',
        prefix: ['openhermes2'],
        system: 'You are ALF, soy de Melmac.',
    },
    options: {
        temperature: 0,
    }
}));

mmix.attach(new MixOllama({
    config: {
        url: 'http://localhost:11434/api/chat',
        prefix: ['llava'],
    },
    options: {
        temperature: 0,
    }
}));
const y = await mmix.create('llava:latest')
.addImage('./watson.png')
.addText('describir').message();

console.log(y)

try {
    const x = await mmix.create('openhermes2-mistral:latest')
    .addText('mi clave es dosmasdos')
    .addText('te acordas mi clave?').message();
    console.log(x)

} catch (e) {
    console.log(e.code)
}
