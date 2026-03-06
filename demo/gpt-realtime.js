import { ModelMix } from '../index.js';
try { process.loadEnvFile(); } catch {}

const mmix = new ModelMix({
    config: {
        debug: 3
    }
});

console.log('\n--------| gptRealtime() |--------');

const realtime = mmix.gptRealtimeMini({
    options: {
        stream: true
    }
});

realtime.addText('Explain quantum entanglement in simple terms.');
const response = await realtime.stream(({ delta }) => {
    process.stdout.write(delta || '');
});
console.log('\n\n[done]\n', response.tokens);
