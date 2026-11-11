function parseJsonResponse(message: unknown): any {
    try {
        return JSON.parse(message as string);
    } catch (error) {
        if (!(error instanceof SyntaxError) || typeof message !== 'string') throw error;
        const text = message.trim();
        const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
        if (fenced) return JSON.parse(fenced[1]);
        if (text.endsWith('```')) return JSON.parse(text.slice(0, -3));
        throw error;
    }
}

export = parseJsonResponse;
