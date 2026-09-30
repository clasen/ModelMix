const { inspect } = require('util');

function formatJSON(obj) {
    return inspect(obj, {
        depth: null,
        colors: true,
        maxArrayLength: null,
        breakLength: 80,
        compact: false
    });
}

function formatMessage(message) {
    if (typeof message !== 'string') return message;

    try {
        return formatJSON(JSON.parse(message.trim()));
    } catch (e) {
        return message;
    }
}

function truncate(str, maxLen = 1000) {
    if (!str || typeof str !== 'string') return str;
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

function formatInputSummary(messages, system, debug = 2) {
    const lastMessage = messages[messages.length - 1];
    let inputText = '';

    if (lastMessage && Array.isArray(lastMessage.content)) {
        const textContent = lastMessage.content.find(c => c.type === 'text');
        if (textContent) inputText = textContent.text;
    } else if (lastMessage && typeof lastMessage.content === 'string') {
        inputText = lastMessage.content;
    }

    const noTruncate = debug >= 3;
    const systemStr = noTruncate ? (system || '') : truncate(system, 500);
    const inputStr = noTruncate ? inputText : truncate(inputText, 1200);
    const msgCount = `(${messages.length} msg${messages.length !== 1 ? 's' : ''})`;

    return `| SYSTEM\n${systemStr}\n| INPUT ${msgCount}\n${inputStr}`;
}

function formatOutputSummary(result, debug) {
    const parts = [];
    const noTruncate = debug >= 3;
    if (result.message) {
        // Try to parse as JSON for better formatting
        try {
            const parsed = JSON.parse(result.message.trim());
            // If it's valid JSON and debug >= 2, show it formatted
            if (debug >= 2) {
                parts.push(`| OUTPUT (JSON)\n${formatJSON(parsed)}`);
            } else {
                parts.push(`| OUTPUT\n${truncate(result.message, 1500)}`);
            }
        } catch (e) {
            parts.push(`| OUTPUT\n${noTruncate ? result.message : truncate(result.message, 1500)}`);
        }
    }
    if (result.think) {
        parts.push(`| THINK\n${noTruncate ? result.think : truncate(result.think, 800)}`);
    }
    if (result.toolCalls && result.toolCalls.length > 0) {
        const toolNames = result.toolCalls.map(t => t.function?.name || t.name).join(', ');
        parts.push(`| TOOLS\n${toolNames}`);
    }
    return parts.join('\n');
}

function logProviderAttempt({ attempt, originalIndex, provider, currentConfig, resolvedModelKey, preparedMessages }) {
    if (currentConfig.debug < 1) return;

    const isPrimary = attempt === 0;
    const prefix = isPrimary ? '→' : '↻';
    const suffix = isPrimary
        ? (currentConfig.roundRobin ? ` (round-robin #${originalIndex + 1})` : '')
        : ' (fallback)';
    const providerName = provider.constructor.name.replace(/^Mix/, '').toLowerCase();
    const effort = currentConfig.effort === undefined ? '' : `@${currentConfig.effort}`;
    const header = `\n${prefix} [${providerName}:${resolvedModelKey}${effort}] #${originalIndex + 1}${suffix}`;

    if (currentConfig.debug >= 2) {
        console.log(`${header}\n${formatInputSummary(preparedMessages, currentConfig.system, currentConfig.debug)}`);
    } else {
        console.log(header);
    }
}

function logProviderSuccess(result, currentConfig) {
    if (currentConfig.debug === 1) console.log('✓ Success');

    if (currentConfig.debug >= 2) {
        const tokenInfo = result.tokens
            ? ` ${result.tokens.input} → ${result.tokens.output} tok`
                + (result.tokens.cached ? ` (cached:${result.tokens.cached})` : '')
                + (result.tokens.speed ? ` | ${result.tokens.speed} t/s` : '')
                + (result.tokens.cost != null ? ` $${result.tokens.cost.toFixed(4)}` : '')
            : '';
        console.log(`✓${tokenInfo}\n${formatOutputSummary(result, currentConfig.debug).trim()}`);
    }

    if (currentConfig.debug >= 4) {
        if (result.response) {
            console.log('\n[RAW RESPONSE]');
            console.log(formatJSON(result.response));
        }
        if (result.message) {
            console.log('\n[FULL MESSAGE]');
            console.log(formatMessage(result.message));
        }
        if (result.think) {
            console.log('\n[FULL THINKING]');
            console.log(result.think);
        }
    }

    if (currentConfig.debug >= 1) console.log('');
}

module.exports = {
    formatJSON,
    formatMessage,
    truncate,
    formatInputSummary,
    formatOutputSummary,
    logProviderAttempt,
    logProviderSuccess
};
