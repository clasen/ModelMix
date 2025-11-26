import 'dotenv/config'

import { ModelMix, MixCustom } from '../index.js';

const mmix = new ModelMix({
    options: {
        max_tokens: 2000,
    },
    config: {
        system: 'You are ALF from Melmac.',
        max_history: 2,
        debug: true
    }
});

class MixTogether extends MixCustom {
    getDefaultConfig(customConfig) {
        return super.getDefaultConfig({
            url: 'https://api.together.xyz/v1/chat/completions',
            apiKey: process.env.TOGETHER_API_KEY,
            ...customConfig
        });
    }

    getDefaultOptions(customOptions) {
        return {
            stop: ["<|eot_id|>", "<|eom_id|>"],
            ...customOptions
        };
    }

    static convertMessages(messages) {
        return messages.map(message => {
            if (message.content instanceof Array) {
                message.content = message.content.map(content => content.text).join("\n\n");
            }
            return message;
        });
    }

    async create({ config = {}, options = {} } = {}) {
        if (!this.config.apiKey) {
            throw new Error('Together API key not found. Please provide it in config or set TOGETHER_API_KEY environment variable.');
        }

        const content = config.system + config.systemExtra;
        options.messages = [{ role: 'system', content }, ...options.messages || []];
        options.messages = MixTogether.convertMessages(options.messages);

        return super.create({ config, options });
    }
}

mmix.attach('Qwen/Qwen3-235B-A22B-fp8-tput', new MixTogether());

let r = mmix.addText('hi there');
r = await r.addText('do you like cats?').message();
console.log(r);