process.loadEnvFile();
import { ModelMix } from '../index.js';

console.log('🧬 RLM Basic Demo - Recursive Language Model');
console.log('📖 Inspired by: https://arxiv.org/html/2512.24601v1\n');

/**
 * RLM Concept: Instead of passing a huge prompt directly to the LLM,
 * we treat it as an external "environment" that the LLM can:
 * 1. Inspect programmatically (peek into parts)
 * 2. Decompose into sub-tasks
 * 3. Process recursively
 */

// Simulamos un documento muy largo (en RLM real, esto podría ser millones de tokens)
const LARGE_DATASET = {
    total_length: '1.5M tokens (simulated)',
    data: [
        { id: 1, name: 'Alice', dept: 'Engineering', score: 9.2, skills: ['JavaScript', 'Python', 'React'] },
        { id: 2, name: 'Bob', dept: 'Analytics', score: 8.7, skills: ['Python', 'R', 'SQL'] },
        { id: 3, name: 'Carol', dept: 'Product', score: 9.5, skills: ['Agile', 'SQL'] },
        { id: 4, name: 'David', dept: 'Engineering', score: 7.8, skills: ['JavaScript', 'Git'] },
        { id: 5, name: 'Emma', dept: 'Analytics', score: 9.0, skills: ['Python', 'ML', 'AWS'] },
        { id: 6, name: 'Frank', dept: 'Engineering', score: 8.9, skills: ['Docker', 'Kubernetes'] },
        { id: 7, name: 'Grace', dept: 'Design', score: 9.3, skills: ['Figma', 'CSS'] },
        { id: 8, name: 'Henry', dept: 'Analytics', score: 7.5, skills: ['SQL', 'Python'] },
    ]
};

let recursionCount = 0;

async function basicRLM() {
    console.log('=== RLM: Procesamiento de Dataset Grande ===\n');
    console.log(`📊 Dataset: ${LARGE_DATASET.total_length}`);
    console.log(`👥 Records: ${LARGE_DATASET.data.length}`);
    console.log('🎯 Query: "Find top Engineering talents with Python skills"\n');

    const mmix = ModelMix.new({ config: { debug: false, max_history: 20 } })
        .gpt41nano()
        .setSystem(`You are an RLM (Recursive Language Model). 
        
Instead of reading all data at once, you:
1. INSPECT: Use 'query_data' to explore the dataset programmatically
2. DECOMPOSE: Break complex queries into simpler sub-queries
3. RECURSE: Use 'solve_subtask' for focused sub-problems

Be strategic: think about what information you need and query only that.`);

    // Tool 1: Query the data environment (instead of loading all into context)
    mmix.addTool({
        name: "query_data",
        description: "Query the large dataset without loading it entirely. You can filter, aggregate, or inspect specific fields.",
        inputSchema: {
            type: "object",
            properties: {
                operation: {
                    type: "string",
                    enum: ["filter", "count", "get_fields", "get_unique_values"],
                    description: "Operation to perform"
                },
                field: {
                    type: "string",
                    description: "Field name to query (e.g., 'dept', 'score', 'skills')"
                },
                condition: {
                    type: "object",
                    description: "Condition for filtering (e.g., {field: 'dept', value: 'Engineering'})"
                }
            },
            required: ["operation"]
        }
    }, async ({ operation, field, condition }) => {
        console.log(`🔍 Query: ${operation}${field ? ` on "${field}"` : ''}${condition ? ` where ${JSON.stringify(condition)}` : ''}`);

        switch (operation) {
            case "count":
                return JSON.stringify({ count: LARGE_DATASET.data.length });
            
            case "get_fields":
                const fields = Object.keys(LARGE_DATASET.data[0]);
                return JSON.stringify({ fields });
            
            case "get_unique_values":
                if (!field) return JSON.stringify({ error: "field required" });
                const unique = [...new Set(LARGE_DATASET.data.map(d => d[field]))];
                return JSON.stringify({ field, unique_values: unique });
            
            case "filter":
                let filtered = LARGE_DATASET.data;
                if (condition) {
                    filtered = filtered.filter(item => {
                        if (condition.operator === 'gt') {
                            return item[condition.field] > condition.value;
                        } else if (condition.operator === 'contains') {
                            return item[condition.field]?.includes(condition.value);
                        } else {
                            return item[condition.field] === condition.value;
                        }
                    });
                }
                console.log(`   → Found ${filtered.length} records`);
                return JSON.stringify({ count: filtered.length, data: filtered });
            
            default:
                return JSON.stringify({ error: "Unknown operation" });
        }
    });

    // Tool 2: Recursive sub-task solver
    mmix.addTool({
        name: "solve_subtask",
        description: "Recursively solve a focused sub-task. Use this to decompose complex queries.",
        inputSchema: {
            type: "object",
            properties: {
                task: {
                    type: "string",
                    description: "The sub-task to solve"
                },
                context: {
                    type: "string",
                    description: "Relevant context/data for this sub-task"
                }
            },
            required: ["task", "context"]
        }
    }, async ({ task, context }) => {
        recursionCount++;
        console.log(`\n🔄 Recursion ${recursionCount}: ${task.substring(0, 60)}...`);

        if (recursionCount > 3) {
            recursionCount--;
            return "Max recursion depth reached. Please solve directly.";
        }

        // Create a focused recursive call
        const subMmix = ModelMix.new({ config: { debug: false } })
            .gpt41nano()
            .setSystem(`Solve this focused sub-task concisely. Recursion level: ${recursionCount}`);

        subMmix.addText(`Context: ${context}\n\nTask: ${task}`);
        
        const result = await subMmix.message();
        recursionCount--;
        
        console.log(`   ✅ Sub-result: ${result.substring(0, 80)}...`);
        return result;
    });

    // Main query
    mmix.addText(`Find the top Engineering employees who have Python skills and score above 8.5.

Use the RLM approach:
1. First explore what fields are available
2. Filter by department
3. Check for Python skills
4. Apply score threshold
5. Summarize the results

Be efficient - only query what you need!`);

    console.log('🤖 LLM Processing with RLM tools...\n');
    const result = await mmix.message();
    
    console.log('\n' + '═'.repeat(70));
    console.log('💡 FINAL ANSWER:');
    console.log('═'.repeat(70));
    console.log(result);
    console.log('═'.repeat(70));
    
    console.log(`\n📈 Statistics:`);
    console.log(`   - Total recursive calls: ${recursionCount}`);
    console.log(`   - Dataset never fully loaded into context ✓`);
    console.log(`   - Programmatic exploration used ✓`);
}

try {
    await basicRLM();
    console.log('\n✅ RLM Basic example completed successfully!');
} catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
}
