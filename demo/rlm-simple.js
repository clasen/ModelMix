import { ModelMix } from '../index.js';
import ivm from 'isolated-vm';
try { process.loadEnvFile(); } catch {}

console.log('🧬 ModelMix - RLM (Recursive Language Model) Demo');
console.log('📄 Basado en: https://arxiv.org/html/2512.24601v1\n');

// Simulamos un documento largo que sería demasiado grande para pasar directamente
const LONG_DOCUMENT = `
USERS DATABASE - System Report 2025
====================================

USER_001: Alice Johnson
Role: Senior Developer
Department: Engineering
Location: San Francisco, CA
Skills: JavaScript, Python, React, Node.js
Projects: 15 completed, 3 in progress
Performance Score: 9.2/10
Last Active: 2025-01-09
Notes: Excellent team leader, mentors junior developers

USER_002: Bob Smith
Role: Data Scientist
Department: Analytics
Location: New York, NY
Skills: Python, R, TensorFlow, SQL
Projects: 8 completed, 2 in progress
Performance Score: 8.7/10
Last Active: 2025-01-08
Notes: Strong statistical background, innovative approaches

USER_003: Carol White
Role: Product Manager
Department: Product
Location: Austin, TX
Skills: Agile, Jira, User Research, SQL
Projects: 22 completed, 5 in progress
Performance Score: 9.5/10
Last Active: 2025-01-09
Notes: Exceptional stakeholder management

USER_004: David Chen
Role: Junior Developer
Department: Engineering
Location: San Francisco, CA
Skills: JavaScript, HTML, CSS, Git
Projects: 3 completed, 1 in progress
Performance Score: 7.8/10
Last Active: 2025-01-07
Notes: Fast learner, needs more experience with backend

USER_005: Emma Davis
Role: Senior Data Scientist
Department: Analytics
Location: Boston, MA
Skills: Python, Machine Learning, PyTorch, AWS
Projects: 12 completed, 4 in progress
Performance Score: 9.0/10
Last Active: 2025-01-09
Notes: Published 5 research papers, conference speaker

USER_006: Frank Martinez
Role: DevOps Engineer
Department: Engineering
Location: Seattle, WA
Skills: Docker, Kubernetes, AWS, Terraform
Projects: 18 completed, 2 in progress
Performance Score: 8.9/10
Last Active: 2025-01-09
Notes: Reduced deployment time by 60%

USER_007: Grace Lee
Role: UX Designer
Department: Design
Location: Los Angeles, CA
Skills: Figma, User Research, Prototyping, CSS
Projects: 25 completed, 6 in progress
Performance Score: 9.3/10
Last Active: 2025-01-08
Notes: Award-winning designer, excellent user empathy

USER_008: Henry Taylor
Role: Junior Data Analyst
Department: Analytics
Location: Chicago, IL
Skills: SQL, Excel, Tableau, Python
Projects: 5 completed, 2 in progress
Performance Score: 7.5/10
Last Active: 2025-01-06
Notes: Good attention to detail, improving Python skills
`;

// Crear isolate para el REPL
const isolate = new ivm.Isolate({ memoryLimit: 256 });

// Contador de llamadas recursivas (para demostrar la recursión)
let recursionDepth = 0;
const maxDepth = 3;

async function rlmExample() {
    console.log('=== RLM: Análisis de Documento Largo ===\n');
    console.log(`📊 Documento: ${LONG_DOCUMENT.length} caracteres`);
    console.log(`🎯 Tarea: Encontrar usuarios de Engineering con score > 8.5\n`);

    const gptArgs = { options: { reasoning_effort: "none", verbosity: null } };
    const mmix = ModelMix.new({ config: { debug: false, max_history: 15 } })
        .gpt41nano()
        .gpt52(gptArgs)
        .gemini3flash()
        .setSystem(`You are an RLM (Recursive Language Model) agent. 
        
KEY PRINCIPLE: Instead of processing the entire document directly, you can:
1. Inspect the document structure using code
2. Break it into smaller chunks programmatically
3. Process each chunk recursively if needed

You have access to:
- inspect_document: Examine parts of the document via JavaScript. The DOCUMENT variable is available. Write code that returns a value (e.g., "return DOCUMENT.length" or just "DOCUMENT.length").
- recursive_call: Make a recursive call to yourself with a focused sub-task

Current recursion depth: ${recursionDepth}/${maxDepth}`);

    // Variables compartidas
    let inspectionResults = [];

    // Tool 1: Inspeccionar el documento programáticamente
    mmix.addTool({
        name: "inspect_document",
        description: "Execute JavaScript code to inspect and analyze the document. The document is available as 'DOCUMENT' variable. You can use string methods, regex, parsing, etc. The code should return a value (not just log it).",
        inputSchema: {
            type: "object",
            properties: {
                code: {
                    type: "string",
                    description: "JavaScript code to execute. The DOCUMENT variable contains the full text. Your code should return a value. Example: 'return DOCUMENT.split(\"\\n\").length' or just 'DOCUMENT.length'"
                },
                explanation: {
                    type: "string",
                    description: "Brief explanation of what this code does"
                }
            },
            required: ["code", "explanation"]
        }
    }, async ({ code, explanation }) => {
        console.log(`\n🔍 [Depth ${recursionDepth}] Inspecting document: ${explanation}`);
        console.log('─'.repeat(60));
        console.log(code);
        console.log('─'.repeat(60));

        try {
            const context = await isolate.createContext();
            
            // Inyectar el documento en el contexto como variable global
            const jail = context.global;
            await jail.set('DOCUMENT', LONG_DOCUMENT);
            
            // Ejecutar el código y convertir el resultado a JSON dentro del contexto
            const wrappedCode = `
                (function() {
                    const result = (function() {
                        ${code}
                    })();
                    return JSON.stringify(result);
                })()
            `;
            
            const script = await isolate.compileScript(wrappedCode);
            const jsonResult = await script.run(context, { timeout: 10000 });
            
            // Parsear el resultado JSON
            const parsedResult = JSON.parse(jsonResult);
            
            inspectionResults.push({ explanation, result: parsedResult });
            
            console.log('✅ Resultado:', JSON.stringify(parsedResult, null, 2));
            return JSON.stringify(parsedResult);
        } catch (error) {
            console.log('❌ Error:', error.message);
            return `Error: ${error.message}`;
        }
    });

    // Tool 2: Llamada recursiva (simplificada para el ejemplo)
    mmix.addTool({
        name: "recursive_call",
        description: "Make a recursive call to the RLM with a focused sub-task and optional document chunk. Use this to decompose complex queries into simpler ones.",
        inputSchema: {
            type: "object",
            properties: {
                sub_task: {
                    type: "string",
                    description: "The focused sub-task to solve recursively"
                },
                document_chunk: {
                    type: "string",
                    description: "Optional: A smaller chunk of the document to focus on"
                }
            },
            required: ["sub_task"]
        }
    }, async ({ sub_task, document_chunk }) => {
        recursionDepth++;
        
        if (recursionDepth > maxDepth) {
            recursionDepth--;
            return `Maximum recursion depth reached (${maxDepth}). Please solve this sub-task directly.`;
        }

        console.log(`\n🔄 [Depth ${recursionDepth}] Recursive call:`);
        console.log(`📝 Sub-task: ${sub_task}`);
        if (document_chunk) {
            console.log(`📄 Chunk size: ${document_chunk.length} chars`);
        }
        console.log('─'.repeat(60));

        // Crear una nueva instancia para la llamada recursiva
        const recursiveMmix = ModelMix.new({ config: { debug: false } })
            .gpt41nano()
            .setSystem(`You are processing a sub-task. Be concise and direct.
Recursion depth: ${recursionDepth}/${maxDepth}
${document_chunk ? 'Document chunk provided.' : 'No document chunk provided.'}`);

        if (document_chunk) {
            recursiveMmix.addText(`Document chunk:\n${document_chunk}\n\nTask: ${sub_task}`);
        } else {
            recursiveMmix.addText(sub_task);
        }

        const result = await recursiveMmix.message();
        
        recursionDepth--;
        
        console.log(`✅ [Depth ${recursionDepth + 1}] Result: ${result.substring(0, 100)}...`);
        return result;
    });

    // La tarea principal
    mmix.addText(`
Using the RLM approach, find all users in the Engineering department with a Performance Score greater than 8.5.

APPROACH:
1. First, use inspect_document to understand the document structure
2. Use inspect_document to extract all user entries
3. Use inspect_document to filter users by department and score
4. Optionally use recursive_call if you need to process sub-tasks

Finally, provide a clear summary with the user names and their scores.
`);

    const result = await mmix.message();
    
    console.log('\n' + '='.repeat(60));
    console.log('💬 FINAL ANSWER:');
    console.log('='.repeat(60));
    console.log(result);
    
    console.log('\n📊 INSPECTION SUMMARY:');
    console.log(`Total inspections: ${inspectionResults.length}`);
    inspectionResults.forEach((r, i) => {
        console.log(`${i + 1}. ${r.explanation}`);
    });
}

try {
    await rlmExample();
    console.log('\n✅ RLM Ejemplo completado');
} catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
}
