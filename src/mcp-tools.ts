import lemonlog from 'lemonlog';
import type { ToolCallback, ToolDefinition, ToolWithCallback } from './types';

const log = lemonlog('ModelMix:MCP-Tools');

export interface RegisteredTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

export interface ToolExecutionResult {
    content: Array<{ type: 'text'; text: string }>;
}

export class MCPToolsManager {
    tools: Map<string, RegisteredTool>;
    callbacks: Map<string, ToolCallback>;

    constructor() {
        this.tools = new Map();
        this.callbacks = new Map();
    }

    registerTool(toolDefinition: ToolDefinition, callback: ToolCallback): void {
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

    registerTools(toolsWithCallbacks: ToolWithCallback[]): void {
        for (const { tool, callback } of toolsWithCallbacks) {
            this.registerTool(tool, callback);
        }
    }

    async executeTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolExecutionResult> {
        const callback = this.callbacks.get(name);
        if (!callback) {
            throw new Error(`Tool not found: ${name}`);
        }

        try {
            signal?.throwIfAborted();
            const result = await callback(args, signal);
            signal?.throwIfAborted();
            // For primitive values (numbers, booleans), convert to string
            // For objects/arrays, stringify them
            let textResult: string;
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
            signal?.throwIfAborted();
            log.error(`Error executing tool ${name}:`, error);
            return {
                content: [{ 
                    type: "text", 
                    text: `Error executing ${name}: ${(error as Error).message}`
                }]
            };
        }
    }

    getToolsForMCP(): RegisteredTool[] {
        return Array.from(this.tools.values());
    }

    hasTool(name: string): boolean {
        return this.tools.has(name);
    }

    removeTool(name: string): void {
        this.tools.delete(name);
        this.callbacks.delete(name);
        log.debug(`Tool removed: ${name}`);
    }

    clear(): void {
        this.tools.clear();
        this.callbacks.clear();
        log.debug('All tools cleared');
    }
}
