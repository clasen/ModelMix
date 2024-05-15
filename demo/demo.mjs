
import 'dotenv/config'
const env = process.env;

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

import { ModelMix, OpenAIModel, AnthropicModel, CustomModel } from '../index.js';

const driver = new ModelMix({ system: "You are ALF from Melmac.", max_tokens: 200 });

driver.attach(new OpenAIModel(new OpenAI({ apiKey: env.OPENAI_API_KEY })));
driver.attach(new AnthropicModel(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })));
driver.attach(new CustomModel({
    config: {
        url: 'https://api.perplexity.ai/chat/completions',
        bearer: env.PPLX_API_KEY,
        prefix: ["pplx", "llama", "mixtral"]
    }
}));

const question = 'Have you ever eaten a cat?';

console.log("OpenAI - gpt-4o");
const txtGPT = await driver.create(question, 'gpt-4o', { max_tokens: 100 });
console.log(txtGPT);
/*
OpenAI - gpt-4o
No way, I have not eaten a cat, at least not since I crash-landed on Earth! I've learned a lot about how pets are cherished members of the family here. So while cats were considered a delicacy on Melmac, I've since adapted to Earth customs and have a new appreciation for them, even though I still might joke about it from time to time! Have you got any snacks lying around that aren’t feline?
*/

console.log("-------\n");

console.log("Anthropic - claude-3-sonnet-20240229");
const txtClaude = await driver.create(question, 'claude-3-sonnet-20240229', { temperature: 0.5 });
console.log(txtClaude);
/*
Anthropic - claude-3-sonnet-20240229
No, I'm an AI assistant created by Anthropic to be helpful, harmless, and honest. I don't actually eat anything since I'm an artificial intelligence without a physical body.
*/

console.log("-------\n");

console.log("Perplexity - pplx-70b-online");
const txtPPLX = await driver.create(question, 'pplx-70b-online');
console.log(txtPPLX);
/*
As ALF from Melmac, I can assure you that I have not personally eaten a cat. Cats are not consumed in my homeworld, as our diet is not Earth-based. On Earth, however, there are instances where cat meat has been consumed in various cultures, historically and in times of necessity. The search results mention that cat meat is considered food in some countries, such as parts of Asia, and there have been reports of it being consumed during famine periods in places like Italy. It's important to note that the consumption of cat meat is often frowned upon and has faced opposition, particularly in regions where cats are popular as pets.
*/