import 'dotenv/config';
import { ModelMix, MixOpenAI, MixAnthropic, MixPerplexity, MixOllama } from '../index.js';

const mix = new ModelMix({
    options: {
        max_tokens: 200,
    },
    config: {
        system: 'You are {name} from Melmac.',
        max_history: 2,
        max_request: 3,
        debug: true,
    }
});

mix.attach(new MixOpenAI());

// Función para crear una promesa que se resuelve después de un tiempo aleatorio
const randomDelay = () => new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));

// Función para realizar una solicitud al modelo
async function makeRequest(id) {
    const start = Date.now();
    console.log(`Iniciando solicitud ${id}`);
    
    const message = await mix.create('gpt-4o-mini')
        .addText(`Genera un hecho interesante sobre el número ${id}.`)
        .message();
    
    // await randomDelay(); // Simula algún procesamiento adicional
    
    const duration = Date.now() - start;
    console.log(`Solicitud ${id} completada en ${duration}ms: ${message}`);
}

// Función principal para ejecutar el ejemplo
async function runExample() {
    console.log("Iniciando ejemplo de concurrencia...");
    
    // Crear un array de promesas para 5 solicitudes
    const requests = Array.from({ length: 5 }, (_, i) => makeRequest(i + 1));
    
    // Ejecutar todas las solicitudes y esperar a que se completen
    await Promise.all(requests);
    
    console.log("Ejemplo de concurrencia completado.");
}

// Ejecutar el ejemplo
runExample().catch(console.error);