const log = require('lemonlog')('ModelMix:MCP-Tools');

class MCPToolsManager {
    constructor() {
        this.tools = new Map();
        this.callbacks = new Map();
    }

    registerTool(toolDefinition, callback) {
        const { name, description, inputSchema } = toolDefinition;
        
        if (!name || !description || !inputSchema) {
            throw new Error('Tool definition must include name, description, and inputSchema');
        }

        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }

        // Registrar la herramienta
        this.tools.set(name, {
            name,
            description,
            inputSchema
        });

        // Registrar el callback
        this.callbacks.set(name, callback);

        log.debug(`Tool registered: ${name}`);
    }

    registerTools(toolsWithCallbacks) {
        for (const { tool, callback } of toolsWithCallbacks) {
            this.registerTool(tool, callback);
        }
    }

    async executeTool(name, args) {
        const callback = this.callbacks.get(name);
        if (!callback) {
            throw new Error(`Tool not found: ${name}`);
        }

        try {
            const result = await callback(args);
            // For primitive values (numbers, booleans), convert to string
            // For objects/arrays, stringify them
            let textResult;
            if (typeof result === 'string') {
                textResult = result;
            } else if (typeof result === 'number' || typeof result === 'boolean') {
                textResult = String(result);
            } else {
                textResult = JSON.stringify(result, null, 2);
            }
            
            return {
                content: [{ 
                    type: "text", 
                    text: textResult
                }]
            };
        } catch (error) {
            log.error(`Error executing tool ${name}:`, error);
            return {
                content: [{ 
                    type: "text", 
                    text: `Error executing ${name}: ${error.message}`
                }]
            };
        }
    }

    getToolsForMCP() {
        return Array.from(this.tools.values());
    }

    hasTool(name) {
        return this.tools.has(name);
    }

    removeTool(name) {
        this.tools.delete(name);
        this.callbacks.delete(name);
        log.debug(`Tool removed: ${name}`);
    }

    clear() {
        this.tools.clear();
        this.callbacks.clear();
        log.debug('All tools cleared');
    }
}

module.exports = { MCPToolsManager };
