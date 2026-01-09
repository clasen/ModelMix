process.loadEnvFile();
import { ModelMix } from '../index.js';
import ivm from 'isolated-vm';

console.log('🧬 ModelMix - JavaScript REPL Tool Demo');

// Crear isolate una sola vez (reutilizable)
const isolate = new ivm.Isolate({ memoryLimit: 128 }); // 128MB máximo

// Ejemplo simple: REPL de JavaScript para calcular potencias de 2
async function replPowersExample() {
    console.log('\n=== JavaScript REPL - Potencias de 2 ===\n');
    const gptArgs = { options: { reasoning_effort: "none", verbosity: null } };
    const mmix = ModelMix.new({ config: { debug: true, max_history: 10 } })
        .gpt41nano()
        .gpt52(gptArgs)
        .gemini3flash()
        .setSystem('You are a helpful assistant with access to a JavaScript REPL. When you use the REPL and get results, always show them to the user in your response.');

    // Variable para capturar el resultado de la herramienta
    let toolResult = null;

    // Agregar herramienta REPL personalizada
    mmix.addTool({
        name: "javascript_repl",
        description: "Execute JavaScript code in a REPL environment. You can run any valid JavaScript code and get the result.",
        inputSchema: {
            type: "object",
            properties: {
                code: {
                    type: "string",
                    description: "JavaScript code to execute"
                }
            },
            required: ["code"]
        }
    }, async ({ code }) => {
        console.log('🔧 Ejecutando código JavaScript:');
        console.log('─'.repeat(50));
        console.log(code);
        console.log('─'.repeat(50));

        try {
            const context = await isolate.createContext();
            const result = await context.eval(`JSON.stringify(eval(${JSON.stringify(code)}))`, { timeout: 10000 });
            toolResult = JSON.parse(result);
            console.log('\n✅ Resultado:', toolResult);
            return result;
        } catch (error) {
            console.log('\n❌ Error:', error.message);
            return `Error: ${error.message}`;
        }
    });

    // Pedir al modelo que calcule 100 potencias de 2
    mmix.addText('Calcular las primeras 100 potencias de 2 (2^0 hasta 2^99). Después de ejecutar el código, menciona algunos valores del resultado como las primeras 5 y las últimas 5 potencias.');

    const result = await mmix.message();
    console.log('\n💬 Respuesta del modelo:');
    console.log(result);

    // Mostrar muestra del resultado si está disponible
    if (toolResult && Array.isArray(toolResult)) {
        console.log('\n📊 Muestra de resultados (primeros 10 y últimos 10):');
        console.log('Primeros 10:', toolResult.slice(0, 10));
        console.log('Últimos 10:', toolResult.slice(-10));
        console.log(`\nTotal: ${toolResult.length} potencias calculadas`);
    }
}

try {
    await replPowersExample();
    console.log('\n✅ Ejemplo completado');
} catch (error) {
    console.error('❌ Error:', error);
}

