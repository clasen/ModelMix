interface MessageLike {
    role?: unknown;
    content?: unknown;
    tool_calls?: unknown;
    tool_call_id?: unknown;
}

export function hasToolInteraction(message: MessageLike | null | undefined): boolean {
    if (!message) return false;
    if (message.role === 'tool' || message.tool_calls || message.tool_call_id) return true;
    // Anthropic-native assistant turns store tool_use blocks in content (no tool_calls).
    if (message.role === 'assistant' && Array.isArray(message.content)) {
        return message.content.some((block: { type?: unknown } | null) => block?.type === 'tool_use');
    }
    return false;
}
