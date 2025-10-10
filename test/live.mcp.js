const { expect } = require('chai');
const { ModelMix } = require('../index.js');
const nock = require('nock');

// Note: This test file makes real API calls and disables nock locally

const setup = {
    options: { temperature: 0 },
    config: { debug: false, max_history: 3 }
};

describe('Live MCP Integration Tests', function () {
    // Increase timeout for real API calls
    this.timeout(60000);
    
    // Ensure nock doesn't interfere with live tests
    before(() => {
        nock.restore();
        nock.cleanAll();
    });
    
    beforeEach(() => {
        nock.restore();
        nock.cleanAll();
    });
    
    after(() => {
        // Re-activate nock for subsequent tests
        nock.activate();
    });

    describe('Basic MCP Tool Integration', function () {

        it('should use custom MCP tools with GPT-4.1', async function () {
            const model = ModelMix.new(setup).gpt41();

            // Add custom calculator tool
            model.addTool({
                name: "calculate",
                description: "Perform mathematical calculations",
                inputSchema: {
                    type: "object",
                    properties: {
                        expression: {
                            type: "string",
                            description: "Mathematical expression to evaluate (e.g., '2 + 2', '10 * 5')"
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

            model.setSystem('You are a helpful calculator. Use the calculate tool for math operations.');
            model.addText('What is 15 * 23?');

            const response = await model.message();
            console.log(`GPT-4.1 with MCP tools: ${response}`);

            expect(response).to.be.a('string');
            expect(response).to.include('345');
        });

        it('should use custom MCP tools with Claude Sonnet 4', async function () {
            const model = ModelMix.new(setup).sonnet4();

            // Add time tool
            model.addTool({
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
                    return `Current time (UTC): ${now.toISOString()}`;
                }
                return `Current time (${timezone}): ${now.toLocaleString('en-US', { timeZone: timezone })}`;
            });

            model.setSystem('You are a helpful assistant that can tell time. Use the get_current_time tool when asked about time.');
            model.addText('What time is it right now?');

            try {
                const response = await model.message();
                console.log(`Claude Sonnet 4 with MCP tools: ${response}`);

                expect(response).to.be.a('string');
                expect(response.toLowerCase()).to.match(/(time|clock|hour|minute|second|am|pm|utc|\d{4})/);
            } catch (error) {
                console.error('Full error:', error);
                if (error.response && error.response.data) {
                    console.error('Response data:', JSON.stringify(error.response.data, null, 2));
                }
                throw error;
            }
        });

        it('should use custom MCP tools with Gemini 2.5 Flash', async function () {
            const model = ModelMix.new(setup).gemini25flash();

            // Add password generator tool
            model.addTool({
                name: "generate_password",
                description: "Generate a secure password",
                inputSchema: {
                    type: "object",
                    properties: {
                        length: {
                            type: "integer",
                            description: "Password length",
                            default: 12
                        },
                        includeSymbols: {
                            type: "boolean",
                            description: "Include special symbols",
                            default: true
                        }
                    }
                }
            }, async ({ length = 12, includeSymbols = true }) => {
                const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
                const charset = includeSymbols ? chars + symbols : chars;
                
                let password = '';
                for (let i = 0; i < length; i++) {
                    password += charset.charAt(Math.floor(Math.random() * charset.length));
                }
                
                return `Generated password (${length} characters): ${password}`;
            });

            model.setSystem('You are a security assistant. Use the generate_password tool to create secure passwords.');
            model.addText('Generate a secure password of 16 characters with symbols.');

            const response = await model.message();
            console.log(`Gemini 2.5 Flash with MCP tools: ${response}`);

            expect(response).to.be.a('string');
            expect(response).to.include('password');
            expect(response).to.include('16');
        });

    });

    describe('Advanced MCP Tool Integration', function () {

        it('should use multiple MCP tools with Grok 3 Mini', async function () {
            const model = ModelMix.new(setup).grok3mini();

            // Add multiple tools
            model.addTools([
                {
                    tool: {
                        name: "calculate",
                        description: "Perform mathematical calculations",
                        inputSchema: {
                            type: "object",
                            properties: {
                                expression: {
                                    type: "string",
                                    description: "Mathematical expression"
                                }
                            },
                            required: ["expression"]
                        }
                    },
                    callback: async ({ expression }) => {
                        const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
                        const result = eval(sanitized);
                        return `${expression} = ${result}`;
                    }
                },
                {
                    tool: {
                        name: "generate_uuid",
                        description: "Generate a UUID",
                        inputSchema: {
                            type: "object",
                            properties: {
                                version: {
                                    type: "string",
                                    enum: ["v4"],
                                    default: "v4"
                                }
                            }
                        }
                    },
                    callback: async ({ version = "v4" }) => {
                        const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                            const r = Math.random() * 16 | 0;
                            const v = c === 'x' ? r : (r & 0x3 | 0x8);
                            return v.toString(16);
                        });
                        return `Generated UUID (${version}): ${uuid}`;
                    }
                }
            ]);

            model.setSystem('You are a helpful assistant with calculation and UUID generation capabilities.');
            model.addText('Calculate 25 * 4 and generate a UUID.');

            const response = await model.message();
            console.log(`Grok 3 Mini with multiple MCP tools: ${response}`);

            expect(response).to.be.a('string');
            expect(response).to.include('100');
            expect(response).to.match(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
        });

        it('should use MCP tools with Scout model', async function () {
            const model = ModelMix.new(setup).scout();

            // Add text processing tool
            model.addTool({
                name: "text_analysis",
                description: "Analyze text and provide statistics",
                inputSchema: {
                    type: "object",
                    properties: {
                        text: {
                            type: "string",
                            description: "Text to analyze"
                        }
                    },
                    required: ["text"]
                }
            }, async ({ text }) => {
                const words = text.split(/\s+/).filter(word => word.length > 0);
                const chars = text.length;
                const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
                
                return `Text Analysis:
- Characters: ${chars}
- Words: ${words.length}
- Sentences: ${sentences}
- Average word length: ${(chars / words.length).toFixed(1)} characters`;
            });

            model.setSystem('You are a text analysis assistant. Use the text_analysis tool to analyze text.');
            model.addText('Analyze this text: "Hello world! This is a test sentence for analysis. How many words are there?"');

            const response = await model.message();
            console.log(`Scout with MCP tools: ${response}`);

            expect(response).to.be.a('string');
            expect(response).to.include('Characters:');
            expect(response).to.include('Words:');
        });

        it('should use MCP tools with GPT-5 Mini', async function () {
            const model = ModelMix.new(setup).gpt5mini();

            // Add data formatting tool
            model.addTool({
                name: "format_data",
                description: "Format data into different formats",
                inputSchema: {
                    type: "object",
                    properties: {
                        data: {
                            type: "string",
                            description: "Data to format"
                        },
                        format: {
                            type: "string",
                            enum: ["json", "csv", "xml"],
                            description: "Output format"
                        }
                    },
                    required: ["data", "format"]
                }
            }, async ({ data, format }) => {
                const items = data.split(',').map(item => item.trim());
                
                switch (format) {
                    case 'json':
                        return JSON.stringify({ items }, null, 2);
                    case 'csv':
                        return `item\n${items.join('\n')}`;
                    case 'xml':
                        return `<items>\n${items.map(item => `  <item>${item}</item>`).join('\n')}\n</items>`;
                    default:
                        return `Unsupported format: ${format}`;
                }
            });

            model.setSystem('You are a data formatting assistant. Use the format_data tool to format data.');
            model.addText('Format this data as JSON: "apple, banana, cherry, date"');

            const response = await model.message();
            console.log(`GPT-4.1 Mini with MCP tools: ${response}`);

            expect(response).to.be.a('string');
            expect(response).to.include('apple');
            expect(response).to.include('banana');
        });

    });

    describe('MCP Tools with JSON Output', function () {

        it('should combine MCP tools with JSON output using GPT-4.1 Nano', async function () {
            const model = ModelMix.new(setup).gpt41nano();

            // Add calculation tool
            model.addTool({
                name: "advanced_math",
                description: "Perform advanced mathematical operations",
                inputSchema: {
                    type: "object",
                    properties: {
                        operation: {
                            type: "string",
                            enum: ["sqrt", "power", "factorial"],
                            description: "Type of operation"
                        },
                        value: {
                            type: "number",
                            description: "Input value"
                        },
                        exponent: {
                            type: "number",
                            description: "Exponent for power operation"
                        }
                    },
                    required: ["operation", "value"]
                }
            }, async ({ operation, value, exponent }) => {
                switch (operation) {
                    case 'sqrt':
                        return Math.sqrt(value);
                    case 'power':
                        if (exponent === undefined) throw new Error('Exponent required for power operation');
                        return Math.pow(value, exponent);
                    case 'factorial':
                        if (value < 0 || !Number.isInteger(value)) throw new Error('Invalid input for factorial');
                        let result = 1;
                        for (let i = 2; i <= value; i++) result *= i;
                        return result;
                    default:
                        throw new Error(`Unknown operation: ${operation}`);
                }
            });

            model.setSystem('You are a mathematical assistant. Use the advanced_math tool to calculate values. When asked to return JSON, format your response as valid JSON with the requested structure.');
            model.addText('Calculate the square root of 144 and the factorial of 5. Return the results in JSON format with keys "sqrt_result" and "factorial_result".');

            const result = await model.json({
                sqrt_result: 0,
                factorial_result: 0,
                calculations: []
            });

            console.log(`GPT-4.1 Nano with MCP tools JSON result:`, JSON.stringify(result, null, 2));

            expect(result).to.be.an('object');
            expect(result.sqrt_result).to.equal(12);
            expect(result.factorial_result).to.equal(120);
        });

        it('should use MCP tools with JSON output using Gemini 2.5 Flash', async function () {
            const model = ModelMix.new(setup).gemini25flash();

            // Add system info tool
            model.addTool({
                name: "system_info",
                description: "Get system information",
                inputSchema: {
                    type: "object",
                    properties: {
                        info_type: {
                            type: "string",
                            enum: ["timestamp", "random", "platform"],
                            description: "Type of system info to get"
                        }
                    },
                    required: ["info_type"]
                }
            }, async ({ info_type }) => {
                switch (info_type) {
                    case 'timestamp':
                        return Date.now();
                    case 'random':
                        return Math.floor(Math.random() * 1000);
                    case 'platform':
                        return process.platform || 'unknown';
                    default:
                        throw new Error(`Unknown info type: ${info_type}`);
                }
            });

            model.setSystem('You are a system assistant. Use the system_info tool and return structured data.');
            model.addText('Get the current timestamp and a random number, format as JSON.');

            const result = await model.json({
                timestamp: 0,
                random_number: 0,
                generated_at: ""
            });

            console.log(`Gemini 2.5 Flash with MCP tools JSON result:`, result);

            expect(result).to.be.an('object');
            expect(result.timestamp).to.be.a('number');
            expect(result.random_number).to.be.a('number');
            expect(result.timestamp).to.be.greaterThan(1700000000000);
        });

    });

    describe('MCP Tools Error Handling', function () {

        it('should handle MCP tool errors gracefully with GPT-5 Nano', async function () {
            const model = ModelMix.new(setup).gpt5nano();

            // Add tool that can fail
            model.addTool({
                name: "risky_operation",
                description: "An operation that might fail",
                inputSchema: {
                    type: "object",
                    properties: {
                        should_fail: {
                            type: "boolean",
                            description: "Whether the operation should fail"
                        }
                    },
                    required: ["should_fail"]
                }
            }, async ({ should_fail }) => {
                if (should_fail) {
                    throw new Error('Operation failed as requested');
                }
                return 'Operation completed successfully';
            });

            model.setSystem('You are a resilient assistant. Handle tool errors gracefully.');
            model.addText('Try the risky operation with should_fail set to true, then explain what happened.');

            const response = await model.message();
            console.log(`GPT-5 Nano with error handling: ${response}`);

            expect(response).to.be.a('string');
            expect(response.toLowerCase()).to.match(/(error|fail|problem|issue)/);
        });

    });

    describe('Multiple Models with Same MCP Tools', function () {

        const createCommonTools = (model) => {
            model.addTool({
                name: "string_utils",
                description: "String utility functions",
                inputSchema: {
                    type: "object",
                    properties: {
                        text: {
                            type: "string",
                            description: "Input text"
                        },
                        operation: {
                            type: "string",
                            enum: ["uppercase", "lowercase", "reverse", "length"],
                            description: "Operation to perform"
                        }
                    },
                    required: ["text", "operation"]
                }
            }, async ({ text, operation }) => {
                switch (operation) {
                    case 'uppercase':
                        return text.toUpperCase();
                    case 'lowercase':
                        return text.toLowerCase();
                    case 'reverse':
                        return text.split('').reverse().join('');
                    case 'length':
                        return text.length.toString();
                    default:
                        throw new Error(`Unknown operation: ${operation}`);
                }
            });
        };

        it('should work with same MCP tools across different OpenAI models', async function () {
            const models = [
                { name: 'GPT-5 Mini', model: ModelMix.new(setup).gpt5mini() },
                { name: 'GPT-5 Nano', model: ModelMix.new(setup).gpt5nano() },
                { name: 'GPT-4.1', model: ModelMix.new(setup).gpt41() }
            ];

            const results = [];

            for (const { name, model } of models) {
                createCommonTools(model);
                model.setSystem('You are a string processing assistant. Use string_utils tool.');
                model.addText('Convert "Hello World" to uppercase using the string utility.');

                const response = await model.message();
                results.push({ model: name, response });
                console.log(`${name}: ${response}`);

                expect(response).to.be.a('string');
                expect(response).to.include('HELLO WORLD');
            }

            expect(results).to.have.length(3);
        });

        it('should work with same MCP tools across different Anthropic models', async function () {
            const models = [
                { name: 'Sonnet 4', model: ModelMix.new(setup).sonnet4() },
                { name: 'Sonnet 4.5', model: ModelMix.new(setup).sonnet45() },
                { name: 'Haiku 3.5', model: ModelMix.new(setup).haiku35() }
            ];

            const results = [];

            for (const { name, model } of models) {
                createCommonTools(model);
                model.setSystem('You are a string processing assistant. Use string_utils tool.');
                model.addText('Get the length of "ModelMix" using the string utility.');

                const response = await model.message();
                results.push({ model: name, response });
                console.log(`${name}: ${response}`);

                expect(response).to.be.a('string');
                expect(response).to.include('8');
            }

            expect(results).to.have.length(3);
        });

    });

});
