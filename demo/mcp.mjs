import 'dotenv/config';
import { ModelMix } from '../index.js';

const mmix = ModelMix.new({
    options: {
        max_tokens: 2000,
    },
    config: {
        system: 'You are an assistant and today is ' + new Date().toLocaleDateString(),
        max_history: 10,
        debug: true
    }
}).sonnet37()//.scout()//.gpt41nano()//.sonnet37().scout()//;//.gpt41nano().scout();

await mmix.addMCP("@modelcontextprotocol/server-brave-search");

const r = await mmix.addText('search the web and tell me when Pope Francis died?').message();
console.log(r);