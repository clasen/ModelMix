const fs = require('node:fs/promises');
const path = require('node:path');

function toText(message, index) {
    const { role, content } = message;
    if (message.tool_calls || role === 'tool') {
        throw new TypeError(`Dataset message at index ${index} contains tool calls; the dataset plugin records text-only conversations.`);
    }
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) {
        throw new TypeError(`Dataset message at index ${index} has unsupported content; the dataset plugin records text-only conversations.`);
    }
    const texts = [];
    for (const part of content) {
        if (part?.type === 'thinking') continue;
        if (part?.type !== 'text' || typeof part.text !== 'string') {
            throw new TypeError(`Dataset message at index ${index} contains "${part?.type}" content; the dataset plugin records text-only conversations.`);
        }
        texts.push(part.text);
    }
    return texts.join('\n\n');
}

function dataset({ file, think = false } = {}) {
    if (typeof file !== 'string' || file.trim().length === 0) {
        throw new TypeError('dataset() requires a non-empty file path.');
    }
    if (typeof think !== 'boolean') {
        throw new TypeError('dataset() think must be a boolean.');
    }
    const filename = path.resolve(file);

    return {
        name: 'dataset',
        async execute(context, next) {
            const { system, messages } = context.request;
            const conversation = messages.map((message, index) => ({
                role: message.role,
                content: toText(message, index)
            }));
            if (system) conversation.unshift({ role: 'system', content: system });

            const result = await next();
            if (typeof result.message !== 'string') {
                throw new TypeError('Dataset plugin requires a text response from the model.');
            }
            const hasReasoning = think && typeof result.think === 'string' && result.think.length > 0;
            conversation.push({
                role: 'assistant',
                ...(hasReasoning && { reasoning_content: result.think }),
                content: result.message
            });
            await fs.appendFile(filename, `${JSON.stringify({ messages: conversation })}\n`);
            return result;
        }
    };
}

module.exports = { dataset };
