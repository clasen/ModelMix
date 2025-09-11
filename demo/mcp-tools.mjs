import 'dotenv/config';
import { ModelMix } from '../index.js';
import fs from 'fs';
import axios from 'axios';

console.log('🧬 ModelMix - MCP Tools Demo with Callbacks');

// Example 1: Basic predefined tools
async function example1() {
    console.log('\n=== Example 1: Common Tools ===');
    
    const mmix = ModelMix.new({ config: { max_history: 10 } })
        .gpt41nano();
    
    // Add custom tools
    mmix.addTool({
        name: "get_current_time",
        description: "Get the current date and time",
        inputSchema: {
            type: "object",
            properties: {
                timezone: {
                    type: "string",
                    description: "Timezone (optional, defaults to UTC)"
                }
            }
        }
    }, async ({ timezone = 'UTC' }) => {
        const now = new Date();
        if (timezone === 'UTC') {
            return now.toISOString();
        }
        return now.toLocaleString('en-US', { timeZone: timezone });
    });
    
    mmix.addTool({
        name: "calculate",
        description: "Perform basic mathematical calculations",
        inputSchema: {
            type: "object",
            properties: {
                expression: {
                    type: "string",
                    description: "Mathematical expression to evaluate"
                }
            },
            required: ["expression"]
        }
    }, async ({ expression }) => {
        try {
            const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
            const result = eval(sanitized);
            return `${expression} = ${result}`;
        } catch (error) {
            throw new Error(`Invalid mathematical expression: ${expression}`);
        }
    });

    mmix.setSystem('You are a helpful assistant. Use the available tools when necessary.');
    mmix.addText('What time is it and what is 15 * 23?');
    
    console.log(await mmix.message());
}

// Example 2: Custom tool for reading files
async function example2() {
    console.log('\n=== Example 2: Custom Tool - Read Files ===');
    
    const mmix = ModelMix.new({ config: { max_history: 10 } })
        .gpt41nano();

    // Register custom tool for reading files
    mmix.addTool({
        name: "read_file",
        description: "Read the contents of a file from the filesystem",
        inputSchema: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Path to the file to read"
                }
            },
            required: ["path"]
        }
    }, async ({ path }) => {
        try {
            const content = fs.readFileSync(path, 'utf8');
            return `File content of ${path}:\n\n${content}`;
        } catch (error) {
            return `Error reading file ${path}: ${error.message}`;
        }
    });

    mmix.setSystem('You are an assistant that can read files. Use the read_file tool when you need to read a file.');
    mmix.addText('Read the contents of the package.json file and tell me what the project name and version are');
    
    console.log(await mmix.message());
}

// Example 3: Tool for making HTTP requests
async function example3() {
    console.log('\n=== Example 3: HTTP Request Tool ===');
    
    const mmix = ModelMix.new({ config: { max_history: 10 } })
        .gpt41nano();

    // Register tool for making HTTP requests
    mmix.addTool({
        name: "http_request",
        description: "Make HTTP requests to external APIs",
        inputSchema: {
            type: "object",
            properties: {
                url: {
                    type: "string",
                    description: "URL to make the request to"
                },
                method: {
                    type: "string",
                    enum: ["GET", "POST", "PUT", "DELETE"],
                    description: "HTTP method",
                    default: "GET"
                }
            },
            required: ["url"]
        }
    }, async ({ url, method = "GET" }) => {
        try {
            const response = await axios({ method, url, timeout: 5000 });
            return `HTTP ${method} ${url}\nStatus: ${response.status}\nResponse: ${JSON.stringify(response.data, null, 2)}`;
        } catch (error) {
            return `Error making HTTP request to ${url}: ${error.message}`;
        }
    });

    mmix.setSystem('You are an assistant that can make HTTP requests. Use the http_request tool when you need to get data from APIs.');
    mmix.addText('Make a GET request to https://jsonplaceholder.typicode.com/posts/1 and tell me what information it contains');
    
    console.log(await mmix.message());
}

// Example 4: Multiple tools working together
async function example4() {
    console.log('\n=== Example 4: Multiple Tools Working Together ===');
    
    const mmix = ModelMix.new({ config: { max_history: 10 } })
        .gpt41nano();

    // Register multiple tools at once
    mmix.addTools([
        {
            tool: {
                name: "write_file",
                description: "Write content to a file",
                inputSchema: {
                    type: "object",
                    properties: {
                        path: {
                            type: "string",
                            description: "Path where to write the file"
                        },
                        content: {
                            type: "string",
                            description: "Content to write"
                        }
                    },
                    required: ["path", "content"]
                }
            },
            callback: async ({ path, content }) => {
                try {
                    fs.writeFileSync(path, content, 'utf8');
                    return `Successfully wrote content to ${path}`;
                } catch (error) {
                    return `Error writing to file ${path}: ${error.message}`;
                }
            }
        },
        {
            tool: {
                name: "list_files",
                description: "List files in a directory",
                inputSchema: {
                    type: "object",
                    properties: {
                        directory: {
                            type: "string",
                            description: "Directory to list files from",
                            default: "."
                        }
                    }
                }
            },
            callback: async ({ directory = "." }) => {
                try {
                    const files = fs.readdirSync(directory);
                    return `Files in ${directory}:\n${files.join('\n')}`;
                } catch (error) {
                    return `Error listing files in ${directory}: ${error.message}`;
                }
            }
        }
    ]);

    // Also add time tool
    mmix.addTool({
        name: "get_current_time",
        description: "Get the current date and time",
        inputSchema: {
            type: "object",
            properties: {
                timezone: {
                    type: "string",
                    description: "Timezone (optional, defaults to UTC)"
                }
            }
        }
    }, async ({ timezone = 'UTC' }) => {
        const now = new Date();
        if (timezone === 'UTC') {
            return now.toISOString();
        }
        return now.toLocaleString('en-US', { timeZone: timezone });
    });

    mmix.setSystem('You are an assistant that can handle files and directories. Use the available tools as needed.');
    mmix.addText('List the files in the current directory, then create a file called "demo-output.txt" with the current date and the list of files');
    
    console.log(await mmix.message());
}

// Example 5: Combining external MCP with local tools
async function example5() {
    console.log('\n=== Example 5: External MCP + Local Tools ===');
    
    const mmix = ModelMix.new({ config: { max_history: 10 } })
        .gpt41nano();

    // Add external MCP (if available)
    try {
        await mmix.addMCP('@modelcontextprotocol/server-brave-search');
        console.log('✓ MCP Brave Search added');
    } catch (error) {
        console.log('⚠️ MCP Brave Search not available:', error.message);
    }

    // Add custom local tools
    mmix.addTool({
        name: "get_current_time",
        description: "Get the current date and time",
        inputSchema: {
            type: "object",
            properties: {
                timezone: {
                    type: "string",
                    description: "Timezone (optional, defaults to UTC)"
                }
            }
        }
    }, async ({ timezone = 'UTC' }) => {
        const now = new Date();
        return timezone === 'UTC' ? now.toISOString() : now.toLocaleString('en-US', { timeZone: timezone });
    });
    
    mmix.addTool({
        name: "calculate",
        description: "Perform basic mathematical calculations",
        inputSchema: {
            type: "object",
            properties: {
                expression: {
                    type: "string",
                    description: "Mathematical expression to evaluate"
                }
            },
            required: ["expression"]
        }
    }, async ({ expression }) => {
        const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
        const result = eval(sanitized);
        return `${expression} = ${result}`;
    });

    mmix.addTool({
        name: "save_search_result",
        description: "Save search results to a file",
        inputSchema: {
            type: "object",
            properties: {
                filename: {
                    type: "string",
                    description: "Name of the file to save results"
                },
                content: {
                    type: "string",
                    description: "Content to save"
                }
            },
            required: ["filename", "content"]
        }
    }, async ({ filename, content }) => {
        try {
            const timestamp = new Date().toISOString();
            const fullContent = `Search Results - ${timestamp}\n\n${content}`;
            fs.writeFileSync(`search-${filename}`, fullContent, 'utf8');
            return `Search results saved to search-${filename}`;
        } catch (error) {
            return `Error saving search results: ${error.message}`;
        }
    });

    mmix.setSystem('You are an assistant that can search the internet and save results. Use the available tools.');
    mmix.addText('Search for information about "ModelMix npm package" and save the results to a file called "modelmix-info.txt"');
    
    console.log(await mmix.message());
}

// Run examples
async function runExamples() {
    try {
        await example1();
        await example2();
        await example3();
        await example4();
        await example5();
        
        console.log('\n✅ All examples completed');
        
        // Show registered tools
        const mmix = ModelMix.new().gpt41nano();
        mmix.addTool({
            name: "example_tool",
            description: "Example tool for demonstration",
            inputSchema: { type: "object", properties: {} }
        }, async () => "Example response");
        console.log('\n📋 Available tools:', mmix.listTools());
        
    } catch (error) {
        console.error('❌ Error in examples:', error);
    }
}

runExamples();
