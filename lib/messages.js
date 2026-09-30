function hasToolInteraction(message) {
    if (!message) return false;
    if (message.role === 'tool' || message.tool_calls || message.tool_call_id) return true;
    // Anthropic-native assistant turns store tool_use blocks in content (no tool_calls).
    if (message.role === 'assistant' && Array.isArray(message.content)) {
        return message.content.some(block => block?.type === 'tool_use');
    }
    return false;
}

module.exports = { hasToolInteraction };
