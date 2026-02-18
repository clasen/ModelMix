import { ModelMix } from '../index.js';

process.loadEnvFile();

const mix = new ModelMix({
    options: {
        max_tokens: 200,
    },
    config: {
        max_history: 2,
        bottleneck: {
            maxConcurrent: 1,     // Maximum number of concurrent requests
        },
        debug: 3,
    }
})

mix.gpt41nano();

// Function to create a promise that resolves after a random time
const randomDelay = () => new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));

// Function to make a request to the model
async function makeRequest(id) {
    const start = Date.now();
    console.log(`Starting request ${id}`);

    const message = await mix
        .addText(`Generate an interesting fact about the number ${id}.`)
        .message();

    await randomDelay(); // Simulates some additional processing

    const duration = Date.now() - start;
    console.log(`Request ${id} finished in ${duration}ms: ${message}`);
}

// Main function to run the example
async function runExample() {
    console.log("Starting concurrency example...");

    // Create a promise array for 5 requests
    const requests = Array.from({ length: 5 }, (_, i) => makeRequest(i + 1));

    // Execute all requests and wait for them to complete
    await Promise.all(requests);

    console.log("Completed concurrency example.");
}

// Run the example
runExample().catch(console.error);