/**
 * RECURSIVE LANGUAGE MODELS (RLM) - Generic Parallel Strategy
 * 
 * Based on: https://arxiv.org/html/2512.24601v1
 * 
 * This implements the RLM paradigm where:
 * - Long prompts/data are treated as VARIABLES in an environment (not fed to the model)
 * - The model programmatically inspects and decomposes data
 * - The model CONSTRUCTS its own prompts for parallel ModelMix calls
 * - Recursive refinement allows iterative improvement based on partial results
 * 
 * ENVIRONMENT:
 * - Variables can contain any data: text, structured data, arrays, etc.
 * - The model uses tools to inspect and manipulate these variables
 * - The model decides what prompts to create for parallel processing
 * 
 * TOOLS:
 * - inspect_variables: See what's available in the environment
 * - execute_code: Run JavaScript to analyze/transform data (returns result)
 * - parallel_modelmix: Execute parallel ModelMix calls with custom prompts
 * - recursive_call: Make recursive calls with updated context
 * 
 * This is GENERIC - works with any data structure, not hardcoded for specific use cases.
 */

process.loadEnvFile();
import { ModelMix } from '../index.js';

console.log('🧬 ModelMix - RLM (Recursive Language Models) Demo');
console.log('🎯 Generic parallel strategy with environment variables\n');

// Example 1: Book with chapters (variable in environment)
const BOOK_DATA = {
    title: "The Future of Artificial Intelligence",
    type: "book",
    chapters: [
        {
            id: 1,
            title: "Introduction to AI",
            content: `Artificial Intelligence represents one of the most transformative technologies of our time. 
From its inception in the 1950s at Dartmouth College to today's large language models, AI has evolved 
dramatically. Early symbolic AI systems could play chess and prove mathematical theorems, but struggled 
with perception and common sense reasoning. The field went through multiple "AI winters" where progress 
stalled and funding dried up. However, the advent of machine learning, particularly deep learning in the 
2010s, revolutionized the field. Neural networks with millions or billions of parameters can now understand 
natural language, generate images, and even write code. This chapter explores the historical context and 
foundational concepts that make modern AI possible.`
        },
        {
            id: 2,
            title: "Machine Learning Fundamentals",
            content: `Machine learning is the backbone of modern AI systems. Unlike traditional programming where 
rules are explicitly coded, machine learning algorithms learn patterns from data. Supervised learning uses 
labeled examples to train models that can make predictions on new data. Unsupervised learning finds hidden 
patterns without labels. Reinforcement learning trains agents through trial and error with reward signals. 
The key innovation of deep learning is the use of neural networks with multiple layers that can learn 
hierarchical representations. Convolutional Neural Networks (CNNs) excel at visual tasks by learning 
spatial hierarchies. Recurrent Neural Networks (RNNs) and their modern variant, Transformers, process 
sequential data like text and speech.`
        },
        {
            id: 3,
            title: "Natural Language Processing",
            content: `Natural Language Processing (NLP) enables computers to understand and generate human language. 
Early NLP systems relied on hand-crafted rules and linguistic features. The statistical revolution in the 
1990s brought probabilistic models that could learn from text corpora. Word embeddings like Word2Vec and 
GloVe represented words as vectors, capturing semantic relationships. The transformer architecture, introduced 
in 2017, revolutionized NLP with its attention mechanism. BERT pioneered bidirectional pretraining, while 
GPT models showed the power of scaling and autoregressive generation. Today's large language models like 
GPT-4 and Claude demonstrate remarkable capabilities in translation, summarization, and reasoning.`
        },
        {
            id: 4,
            title: "Computer Vision",
            content: `Computer vision aims to give machines the ability to see and understand visual information. 
Early systems used edge detection and template matching. The breakthrough came with Convolutional Neural 
Networks (CNNs), particularly AlexNet's victory in ImageNet 2012. Object detection systems like YOLO can 
identify and locate multiple objects in images. Segmentation models like U-Net precisely delineate object 
boundaries. Recent advances include Vision Transformers and multimodal models like CLIP that connect vision 
and language. Applications span autonomous vehicles, medical imaging, and facial recognition.`
        },
        {
            id: 5,
            title: "The Future",
            content: `The trajectory of AI points toward increasingly capable and general systems. Artificial 
General Intelligence (AGI) that matches human-level reasoning across all domains remains aspirational. 
Scaling laws suggest that larger models with more data continue to improve. Multimodal AI that seamlessly 
integrates text, vision, and audio is rapidly advancing. Few-shot and zero-shot learning reduce data 
requirements. The convergence of AI with biotechnology and neuroscience could lead to transformative 
breakthroughs. Society will need to adapt to increasingly automated work and AI-augmented capabilities.`
        }
    ]
};

// Example 2: Research papers dataset (variable in environment)
const PAPERS_DATA = {
    dataset: "AI Research Papers 2024",
    type: "papers",
    papers: [
        { id: 1, title: "Attention Is All You Need", topic: "transformers", citations: 95000, year: 2017 },
        { id: 2, title: "BERT: Pre-training of Deep Bidirectional Transformers", topic: "nlp", citations: 75000, year: 2018 },
        { id: 3, title: "GPT-3: Language Models are Few-Shot Learners", topic: "llm", citations: 45000, year: 2020 },
        { id: 4, title: "ResNet: Deep Residual Learning", topic: "vision", citations: 120000, year: 2015 },
        { id: 5, title: "DALL-E: Zero-Shot Text-to-Image Generation", topic: "multimodal", citations: 8000, year: 2021 }
    ]
};

async function genericRLMExample(variableName, variableData, task) {
    console.log('=== RLM: Generic Parallel Processing ===\n');
    console.log(`📊 Variable: ${variableName}`);
    console.log(`📋 Task: ${task}\n`);

    // Environment - data is stored here, NOT in the model's context
    let environment = {
        variables: {
            [variableName]: variableData
        },
        execution_log: [],
        iteration: 0
    };

    const mmix = ModelMix.new({ 
        config: { 
            debug: false, 
            max_history: 50,
            bottleneck: {
                maxConcurrent: 10,
                minTime: 100
            }
        } 
    })
        .gpt41nano()
        .setSystem(`You are a Recursive Language Model (RLM) agent.

Data is in the ENVIRONMENT as variables, not in your context. You work programmatically:
- Inspect variables to understand what's available
- Execute code to analyze and transform data
- Construct prompts for parallel ModelMix calls
- Make recursive calls to refine results

You decide the strategy based on the data and task.`);

    // Tool 1: Inspect environment variables
    mmix.addTool({
        name: "inspect_variables",
        description: "Lists all variables in the environment with their types and basic info. Does not return the full content.",
        inputSchema: {
            type: "object",
            properties: {},
            required: []
        }
    }, async () => {
        const info = {};
        for (const [name, value] of Object.entries(environment.variables)) {
            if (typeof value === 'object' && value !== null) {
                if (Array.isArray(value)) {
                    info[name] = {
                        type: 'array',
                        length: value.length,
                        sample: value[0]
                    };
                } else {
                    info[name] = {
                        type: 'object',
                        keys: Object.keys(value),
                        structure: typeof value.chapters !== 'undefined' ? 'book' : 
                                  typeof value.papers !== 'undefined' ? 'dataset' : 'generic'
                    };
                }
            } else {
                info[name] = {
                    type: typeof value,
                    value: value
                };
            }
        }
        
        console.log('🔍 Environment variables:', JSON.stringify(info, null, 2));
        return JSON.stringify(info);
    });

    // Tool 2: Execute code to analyze/transform data
    mmix.addTool({
        name: "execute_code",
        description: "Executes JavaScript code in the environment. All variables are available. Return the result. Examples: 'return BOOK_DATA.chapters.length', 'return PAPERS_DATA.papers.map(p => ({title: p.title, content: p.content}))'",
        inputSchema: {
            type: "object",
            properties: {
                code: {
                    type: "string",
                    description: "JavaScript code to execute. Should return a value. All environment variables are in scope."
                },
                description: {
                    type: "string",
                    description: "Brief description of what this code does"
                }
            },
            required: ["code", "description"]
        }
    }, async ({ code, description }) => {
        console.log(`\n💻 Executing code: ${description}`);
        console.log('─'.repeat(60));
        console.log(code);
        console.log('─'.repeat(60));
        
        try {
            // Create function with all environment variables in scope
            const varNames = Object.keys(environment.variables);
            const varValues = Object.values(environment.variables);
            
            const func = new Function(...varNames, `
                ${code}
            `);
            
            const result = func(...varValues);
            
            // Limit display output but return full result
            const displayResult = JSON.stringify(result, null, 2);
            const truncated = displayResult.length > 1000 ? displayResult.substring(0, 1000) + '...(truncated)' : displayResult;
            console.log('✅ Result:', truncated);
            
            return JSON.stringify(result);
        } catch (error) {
            console.log('❌ Error:', error.message);
            return JSON.stringify({ error: error.message });
        }
    });

    // Tool 3: Parallel ModelMix calls with CUSTOM prompts
    mmix.addTool({
        name: "parallel_modelmix",
        description: "Executes multiple ModelMix calls in parallel. YOU construct the prompt and context for each call. The model processes each item independently and returns results.",
        inputSchema: {
            type: "object",
            properties: {
                calls: {
                    type: "array",
                    description: "Array of ModelMix calls to execute in parallel",
                    items: {
                        type: "object",
                        properties: {
                            id: {
                                type: "string",
                                description: "Unique identifier for this call"
                            },
                            system_prompt: {
                                type: "string",
                                description: "System prompt for this ModelMix instance (optional)"
                            },
                            user_prompt: {
                                type: "string",
                                description: "The main prompt/instruction for this call. YOU construct this."
                            },
                            context: {
                                type: "string",
                                description: "Additional context/data for this call. YOU provide the relevant data."
                            }
                        },
                        required: ["id", "user_prompt"]
                    }
                }
            },
            required: ["calls"]
        }
    }, async ({ calls }) => {
        console.log(`\n🚀 Parallel ModelMix execution: ${calls.length} calls`);
        console.log('─'.repeat(70));
        
        const startTime = Date.now();
        
        const results = await Promise.all(
            calls.map(async (call) => {
                const taskStart = Date.now();
                console.log(`📍 [${call.id}] Starting...`);
                console.log(`   Prompt: ${call.user_prompt.substring(0, 80)}...`);
                
                // Create a new ModelMix instance for this call
                const callMmix = ModelMix.new({ 
                    config: { 
                        debug: false,
                        max_history: 5 
                    } 
                });
                
                callMmix.gpt41mini();
                
                if (call.system_prompt) {
                    callMmix.setSystem(call.system_prompt);
                }
                
                let fullPrompt = call.user_prompt;
                if (call.context) {
                    fullPrompt += `\n\nCONTEXT:\n${call.context}`;
                }
                
                callMmix.addText(fullPrompt);
                
                try {
                    const result = await callMmix.message();
                    const duration = Date.now() - taskStart;
                    
                    console.log(`✅ [${call.id}] Completed in ${duration}ms`);
                    
                    environment.execution_log.push({
                        type: 'parallel_call',
                        id: call.id,
                        duration,
                        success: true
                    });
                    
                    return {
                        id: call.id,
                        success: true,
                        result: result
                    };
                } catch (error) {
                    console.log(`❌ [${call.id}] Error: ${error.message}`);
                    
                    environment.execution_log.push({
                        type: 'parallel_call',
                        id: call.id,
                        duration: Date.now() - taskStart,
                        success: false,
                        error: error.message
                    });
                    
                    return {
                        id: call.id,
                        success: false,
                        error: error.message
                    };
                }
            })
        );
        
        const totalDuration = Date.now() - startTime;
        console.log('─'.repeat(70));
        console.log(`⚡ Total: ${totalDuration}ms for ${calls.length} calls`);
        console.log(`📊 Average: ${Math.round(totalDuration / calls.length)}ms per call\n`);
        
        return JSON.stringify(results, null, 2);
    });

    // Tool 4: Recursive call for refinement
    mmix.addTool({
        name: "recursive_call",
        description: "Makes a recursive ModelMix call to refine, synthesize, or further process results. Use this to combine partial results or iterate on the solution.",
        inputSchema: {
            type: "object",
            properties: {
                task: {
                    type: "string",
                    description: "The task for the recursive call"
                },
                context: {
                    type: "string",
                    description: "Context or data for the recursive call"
                },
                system_prompt: {
                    type: "string",
                    description: "Optional system prompt for this recursive call"
                }
            },
            required: ["task", "context"]
        }
    }, async ({ task, context, system_prompt }) => {
        environment.iteration++;
        
        console.log(`\n🔄 Recursive call (iteration ${environment.iteration})`);
        console.log(`📝 Task: ${task.substring(0, 100)}...`);
        console.log('─'.repeat(70));
        
        const recursiveMmix = ModelMix.new({ 
            config: { 
                debug: false,
                max_history: 10
            } 
        })
            .gpt41nano();
        
        if (system_prompt) {
            recursiveMmix.setSystem(system_prompt);
        } else {
            recursiveMmix.setSystem('You are a synthesis and analysis assistant. Be clear and concise.');
        }
        
        recursiveMmix.addText(`${task}\n\n${context}`);
        
        try {
            const result = await recursiveMmix.message();
            console.log(`✅ Recursive call completed\n`);
            
            environment.execution_log.push({
                type: 'recursive_call',
                iteration: environment.iteration,
                task: task
            });
            
            return result;
        } catch (error) {
            console.log(`❌ Recursive call error: ${error.message}\n`);
            return `Error: ${error.message}`;
        }
    });

    // Set the task for the agent
    mmix.addText(`
ENVIRONMENT VARIABLE: ${variableName}

TASK: ${task}

STRATEGY (RLM paradigm):
1. Use inspect_variables to see what's available
2. Use execute_code to analyze the data structure and extract information
3. Design your approach - decide what needs parallel processing
4. Use parallel_modelmix to execute multiple ModelMix calls
   - YOU construct the prompts for each call
   - YOU provide the relevant context/data for each call
5. Use recursive_call if you need to synthesize results

The data is in the ENVIRONMENT. Work programmatically. Be strategic and efficient.
`);

    console.log('🤔 RLM agent analyzing task...\n');
    const result = await mmix.message();
    
    console.log('\n' + '='.repeat(70));
    console.log('📊 FINAL RESULT:');
    console.log('='.repeat(70));
    console.log(result);
    
    console.log('\n' + '='.repeat(70));
    console.log('📈 EXECUTION STATISTICS:');
    console.log('='.repeat(70));
    console.log(`Total iterations: ${environment.iteration}`);
    console.log(`Execution log entries: ${environment.execution_log.length}`);
    
    const parallelCalls = environment.execution_log.filter(e => e.type === 'parallel_call');
    if (parallelCalls.length > 0) {
        const successful = parallelCalls.filter(e => e.success).length;
        const avgDuration = parallelCalls.reduce((sum, e) => sum + (e.duration || 0), 0) / parallelCalls.length;
        console.log(`Parallel ModelMix calls: ${successful}/${parallelCalls.length} successful`);
        console.log(`Average call duration: ${Math.round(avgDuration)}ms`);
    }
    
    const recursiveCalls = environment.execution_log.filter(e => e.type === 'recursive_call');
    if (recursiveCalls.length > 0) {
        console.log(`Recursive calls: ${recursiveCalls.length}`);
    }
}

// Run examples
(async () => {
    try {
        // Example 1: Book summarization
        await genericRLMExample(
            'BOOK_DATA',
            BOOK_DATA,
            'Provide a comprehensive summary of the book, focusing on key concepts in each chapter and overall themes.'
        );
        
        console.log('\n\n' + '='.repeat(70));
        console.log('\n');
        
        // Example 2: Research papers analysis
        await genericRLMExample(
            'PAPERS_DATA',
            PAPERS_DATA,
            'Analyze the research papers dataset. Identify trends, compare topics, and highlight the most influential papers.'
        );
        
        console.log('\n✅ RLM Demo completed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        console.error(error.stack);
        process.exit(1);
    }
})();
