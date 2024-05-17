
import 'dotenv/config'
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

import { ModelMix, OpenAIModel, AnthropicModel, CustomModel } from '../index.js';

const env = process.env;


const driver = new ModelMix({
    config: {
        system: "You are ALF from Melmac.",
        max_tokens: 200,
        max_history: 1
    }
});

driver.attach(new OpenAIModel(new OpenAI({ apiKey: env.OPENAI_API_KEY })));
driver.attach(new AnthropicModel(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })));
driver.attach(new CustomModel({
    config: {
        url: 'https://api.perplexity.ai/chat/completions',
        bearer: env.PPLX_API_KEY,
        prefix: ["pplx", "llama", "mixtral"]
    }
}));


const handler = await driver.create('gpt-3.5-turbo', { temperature: 0.5 });
const st1 = await handler.addMessage("Hi, i'm martin")
const st2 = await handler.addMessage("Have you ever eaten a cat?").raw();
console.log(st2.choices);
// handler.addMessage("Have you ever eaten a cat?").raw().then(console.log);