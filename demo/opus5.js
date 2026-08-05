import { ModelMix } from '../index.js';
try { process.loadEnvFile(); } catch {}


const mmix = new ModelMix({
    config: {
        debug: 3,
    }
});

console.log("\n" + '--------| opus5() |--------');

const opus = mmix.opus5();
opus.addText("Explain quantum entanglement in simple terms.");
const response = await opus.message();
console.log(response);

console.log("\n" + '--------| effort(100).opus5() |--------');

const opusThink = mmix.new().effort(100).opus5();
opusThink.addText("A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost?");
const thinkResponse = await opusThink.raw();
console.log(thinkResponse);
