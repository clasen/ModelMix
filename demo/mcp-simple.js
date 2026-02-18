import { ModelMix } from '../index.js';
try { process.loadEnvFile(); } catch {}

console.log('🧬 ModelMix - Simple MCP Tools Demo');

// Simple example: Calculator with custom tool
async function simpleCalculator() {
    console.log('\n=== Smart Calculator ===');

    const mmix = ModelMix.new()
        .gpt41nano()
        .setSystem('You are a smart calculator. Use the available tools to perform calculations.');

    // Add custom tool for advanced operations
    mmix.addTool({
        name: "advanced_math",
        description: "Perform advanced mathematical operations like power, square root, factorial",
        inputSchema: {
            type: "object",
            properties: {
                operation: {
                    type: "string",
                    enum: ["power", "sqrt", "factorial", "sin", "cos", "tan"],
                    description: "Type of operation to perform"
                },
                value: {
                    type: "number",
                    description: "Input value"
                },
                exponent: {
                    type: "number",
                    description: "Exponent for power operation (optional)"
                }
            },
            required: ["operation", "value"]
        }
    }, async ({ operation, value, exponent }) => {
        switch (operation) {
            case "power":
                if (exponent === undefined) return "Error: exponent required for power operation";
                return `${value}^${exponent} = ${Math.pow(value, exponent)}`;
            case "sqrt":
                return `√${value} = ${Math.sqrt(value)}`;
            case "factorial":
                if (value < 0 || !Number.isInteger(value)) return "Error: factorial only works with non-negative integers";
                let result = 1;
                for (let i = 2; i <= value; i++) result *= i;
                return `${value}! = ${result}`;
            case "sin":
                return `sin(${value}) = ${Math.sin(value)}`;
            case "cos":
                return `cos(${value}) = ${Math.cos(value)}`;
            case "tan":
                return `tan(${value}) = ${Math.tan(value)}`;
            default:
                return "Unknown operation";
        }
    });

    // Also add the custom basic calculator
    mmix.addTool({
        name: "calculate",
        description: "Perform basic mathematical calculations",
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
            // Sanitize the expression to avoid malicious code
            const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
            const result = eval(sanitized);
            return `${expression} = ${result}`;
        } catch (error) {
            throw new Error(`Invalid mathematical expression: ${expression}`);
        }
    });

    mmix.addText('Calculate 2^10, the square root of 144, and the factorial of 5');

    const result = await mmix.message();
    console.log(result);
}

// Example of tool for generating content
async function contentGenerator() {
    console.log('\n=== Content Generator ===');

    const mmix = ModelMix.new({ config: { debug: 2, max_history: 1 } })
        .gemini3flash()
        .setSystem('You are a creative assistant that can generate different types of content.');

    // Tool for generating passwords
    mmix.addTool({
        name: "generate_password",
        description: "Generate a secure password with specified criteria",
        inputSchema: {
            type: "object",
            properties: {
                length: {
                    type: "integer",
                    description: "Length of the password",
                    default: 12
                },
                includeSymbols: {
                    type: "boolean",
                    description: "Include special symbols",
                    default: true
                },
                includeNumbers: {
                    type: "boolean",
                    description: "Include numbers",
                    default: true
                }
            }
        }
    }, async ({ length = 12, includeSymbols = true, includeNumbers = true }) => {

        let password = "@@@@@@@@@@@@";
        return `Generated password (${length} chars): ${password}`;
    });

    // Tool for generating UUID
    mmix.addTool({
        name: "generate_uuid",
        description: "Generate a UUID (Universally Unique Identifier)",
        inputSchema: {
            type: "object",
            properties: {
                version: {
                    type: "string",
                    enum: ["v4"],
                    description: "UUID version",
                    default: "v4"
                }
            }
        }
    }, async ({ version = "v4" }) => {
        // Simple UUID v4 generator
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
    });

    mmix.addText('Generate a secure 16-character password with symbols and a UUID');

    const result = await mmix.message();
    console.log(result);
}

// Run examples
async function runExamples() {
    try {
        // await simpleCalculator();
        await contentGenerator();
        console.log('\n✅ Simple examples completed');
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

runExamples();
