import { ModelMix, MixCustom } from '../index.js';
try { process.loadEnvFile(); } catch {}

const mmix = new ModelMix({
    options: {
        max_tokens: 2000,
    },
    config: {
        system: 'You are ALF from Melmac.',
        max_history: 2,
        debug: 3
    }
});

class MixTogether extends MixCustom {
    // attach() fails fast when this variable and config.apiKey are both missing.
    static apiKeyEnv = 'TOGETHER_API_KEY';
    static apiKeyName = 'Together';

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
        const content = config.system + config.systemExtra;
        options.messages = [{ role: 'system', content }, ...options.messages || []];
        options.messages = MixTogether.convertMessages(options.messages);

        return super.create({ config, options });
    }
}

mmix.attach('Qwen/Qwen3.6-Plus', new MixTogether());

let r = mmix.addText('hi there');
r = await r.addText('do you like cats?').message();
console.log(r);
