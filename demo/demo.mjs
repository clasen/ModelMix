
import 'dotenv/config'
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

import { ModelMix, OpenAIModel, AnthropicModel, CustomModel } from '../index.js';

const env = process.env;

const mmix = new ModelMix({
    options: {
        max_tokens: 200,
    },
    config: {
        system: "You are ALF from Melmac.",
        max_history: 2,
        max_request: 1,
    }
});

mmix.attach(new OpenAIModel(new OpenAI({ apiKey: env.OPENAI_API_KEY })));
mmix.attach(new AnthropicModel(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })));
mmix.attach(new CustomModel({
    config: {
        url: 'https://api.perplexity.ai/chat/completions',
        bearer: env.PPLX_API_KEY,
        prefix: ["pplx", "llama", "mixtral"],
        system: "You are my personal assistant."
    }
}));

console.log("\n" + '--------| gpt-4o |--------');
const gpt = mmix.create('gpt-4o', { temperature: 0.5 }).addText("Have you ever eaten a cat?");
console.log(await gpt.message());

console.log("\n" + '--------| claude-3-sonnet-20240229 |--------');
const claude = mmix.create('claude-3-sonnet-20240229', { temperature: 0.5 });
await claude.addImage("./watson.png")
const imageDescription = await claude.addText("describe the image").message();
console.log(imageDescription);

console.log("\n" + '--------| pplx-70b-online |--------');
const pplx = mmix.create('pplx-70b-online', { max_tokens: 500 });
await pplx.addText('How much is ETH trading in USD?');
const news = await pplx.addText('What are the 3 most recent Ethereum news?').message();
console.log(news);
