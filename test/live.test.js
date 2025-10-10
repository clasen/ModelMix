const { expect } = require('chai');
const { ModelMix, MixOpenAI, MixAnthropic, MixGoogle } = require('../index.js');
const path = require('path');
const fixturesPath = path.join(__dirname, 'fixtures');

const blueSquareBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAMAAABHPGVmAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyhpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDkuMS1jMDAzIDc5Ljk2OTBhODdmYywgMjAyNS8wMy8wNi0yMDo1MDoxNiAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIDI2LjkgKE1hY2ludG9zaCkiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6REM2QzQ3NEQ2Q0I5MTFGMDlBRTVGQzcwQjMyMkY4MDciIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6REM2QzQ3NEU2Q0I5MTFGMDlBRTVGQzcwQjMyMkY4MDciPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDpEQzZDNDc0QjZDQjkxMUYwOUFFNUZDNzBCMzIyRjgwNyIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDpEQzZDNDc0QzZDQjkxMUYwOUFFNUZDNzBCMzIyRjgwNyIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/PvArxh0AAAAGUExURQAA/wAAAHtivz4AAAAjSURBVHja7MGBAAAAAMOg+VNf4QBVAQAAAAAAAAAAAI8JMAAndAABi7SX2gAAAABJRU5ErkJggg==';

const setup = {
    options: { temperature: 0 },
    config: { debug: false, max_history: 2 }
};

describe('Live Integration Tests', function () {
    // Increase timeout for real API calls
    this.timeout(30000);

    describe('Image Processing', function () {

        it('should process images with OpenAI GPT-5nano', async function () {
            const model = ModelMix.new(setup).gpt5nano();

            model.addImageFromUrl(blueSquareBase64)
                .addText('What color is this image? Answer in one word only.');

            const response = await model.message();

            console.log(`OpenAI GPT-4o response: ${response}`);

            expect(response).to.be.a('string');
            expect(response.toLowerCase()).to.include('blue');
        });

        it('should process images with Anthropic Claude', async function () {
            const model = ModelMix.new(setup).sonnet45();

            model.addImageFromUrl(blueSquareBase64)
                .addText('What color is this image? Answer in one word only.');

            const response = await model.message();
            console.log(`Anthropic Claude response: ${response}`);

            expect(response).to.be.a('string');
            expect(response.toLowerCase()).to.include('blue');
        });

        it('should process images with Google Gemini', async function () {
            const model = ModelMix.new(setup).gemini25flash();

            model.addImageFromUrl(blueSquareBase64)
                .addText('What color is this image? Answer in one word only.');

            const response = await model.message();
            console.log(`Google Gemini response: ${response}`);

            expect(response).to.be.a('string');
            expect(response.toLowerCase()).to.include('blue');
        });

    });

    describe('JSON Structured Output', function () {

        it('should return structured JSON with OpenAI', async function () {
            const model = ModelMix.new(setup).gpt5mini();

            model.addText('Generate information about a fictional character.');

            const result = await model.json({
                name: "John Doe",
                age: 30,
                occupation: "Engineer",
                skills: ["JavaScript", "Python"]
            }, {}, { addNote: true });

            console.log(`OpenAI JSON result:`, result);

            expect(result).to.be.an('object');
            expect(result).to.have.property('name');
            expect(result).to.have.property('age');
            expect(result).to.have.property('occupation');
            expect(result).to.have.property('skills');
            expect(result.skills).to.be.an('array');
        });

        it('should return structured JSON with Sonnet 4.5 thinking', async function () {
            const model = ModelMix.new(setup).sonnet45think();

            model.addText('Generate information about a fictional city.');

            const result = await model.json({
                name: "Springfield",
                population: 50000,
                country: "USA",
                attractions: ["Museum", "Park"]
            });

            console.log(`Anthropic JSON result:`, result);

            expect(result).to.be.an('object');
            expect(result).to.have.property('name');
            expect(result).to.have.property('population');
            expect(result).to.have.property('country');
            expect(result).to.have.property('attractions');
            expect(result.attractions).to.be.an('array');
        });

        it('should return structured JSON with Google Gemini', async function () {
            const model = ModelMix.new(setup).gemini25flash();

            model.addText('Generate information about a fictional city.');

            const result = await model.json({
                name: "Springfield",
                population: 50000,
                country: "USA",
                attractions: ["Museum", "Park"]
            });

            console.log(`Google Gemini JSON result:`, result);

            expect(result).to.be.an('object');
            expect(result).to.have.property('name');
            expect(result).to.have.property('population');
            expect(result).to.have.property('country');
            expect(result).to.have.property('attractions');
            expect(result.attractions).to.be.an('array');
        });


    });

    describe('Model Fallback', function () {

        it('should fallback from OpenAI to Anthropic', async function () {
            // Create a model chain: non-existent model -> Claude
            const model = ModelMix.new(setup)
                .attach('non-existent-model', new MixOpenAI())
                .sonnet4();

            model.addText('Say "fallback test successful" and nothing else.');

            const response = await model.message();
            console.log(`Fallback test result: ${response}`);

            expect(response).to.be.a('string');
            expect(response.toLowerCase()).to.include('fallback test successful');
        });

        it('should fallback from Anthropic to OpenAI', async function () {
            // Create a model chain: non-existent model -> Claude
            const model = ModelMix.new(setup)
                .attach('non-existent-model', new MixAnthropic())
                .gpt41nano();

            model.addText('Say "fallback test successful" and nothing else.');

            const response = await model.message();
            console.log(`Fallback test result: ${response}`);

            expect(response).to.be.a('string');
            expect(response.toLowerCase()).to.include('fallback test successful');
        });

    });

    describe('Additional Model Tests', function () {

        it('should work with Scout model', async function () {
            const model = ModelMix.new(setup).scout();

            model.addText('Say "scout test successful" and nothing else.');

            const response = await model.message();
            console.log(`Scout response: ${response}`);

            expect(response).to.be.a('string');
            expect(response.toLowerCase()).to.include('scout test successful');
        });

        it('should work with KimiK2 model', async function () {
            const model = ModelMix.new(setup).kimiK2();

            model.addText('Say "kimik2 test successful" and nothing else.');

            const response = await model.message();
            console.log(`KimiK2 response: ${response}`);

            expect(response).to.be.a('string');
            expect(response.toLowerCase()).to.include('kimik2 test successful');
        });

        it('should work with GPT-OSS model', async function () {
            const model = ModelMix.new(setup).gptOss();

            model.addText('Say "gptoss test successful" and nothing else.');

            const response = await model.message();
            console.log(`GPT-OSS response: ${response}`);

            expect(response).to.be.a('string');
            expect(response.toLowerCase()).to.include('gptoss test successful');
        });

        it('should work with Grok3Mini model', async function () {
            const model = ModelMix.new(setup).grok3mini();

            model.addText('Say "grok3mini test successful" and nothing else.');

            const response = await model.message();
            console.log(`Grok3Mini response: ${response}`);

            expect(response).to.be.a('string');
            expect(response.toLowerCase()).to.include('grok3mini test successful');
        });

    });

    describe('Image Processing with JSON Output', function () {

        it('should process images and return JSON with Maverick', async function () {
            const model = ModelMix.new(setup).maverick();
            model.addImage(path.join(fixturesPath, 'img.png'))
                .addText('Analyze this image and provide details in JSON format.');

            const result = await model.json({
                color: "string",
                shape: "string",
                description: "string"
            });

            console.log(`Scout image JSON result:`, result);

            expect(result).to.be.an('object');
            expect(result).to.have.property('color');
            expect(result).to.have.property('shape');
            expect(result).to.have.property('description');
            expect(result.color.toLowerCase()).to.include('blue');
        });

        it('should process images and return JSON with Grok 4', async function () {
            const model = ModelMix.new(setup).grok4();

            model.addImageFromUrl(blueSquareBase64)
                .addText('Analyze this image and provide details in JSON format.');

            const result = await model.json({
                color: "string",
                shape: "string",
                description: "string"
            });

            console.log(`Grok3Mini image JSON result:`, result);

            expect(result).to.be.an('object');
            expect(result).to.have.property('color');
            expect(result).to.have.property('shape');
            expect(result).to.have.property('description');
            expect(result.color.toLowerCase()).to.include('blue');
        });

    });

    describe('JSON Structured Output for New Models', function () {

        it('should return structured JSON with Scout', async function () {
            const model = ModelMix.new(setup).scout();

            model.addText('Generate information about a fictional animal.');

            const result = await model.json({
                name: "Dragon",
                type: "Mythical",
                abilities: ["Fire breathing", "Flight"],
                habitat: "Mountains"
            });

            console.log(`Scout JSON result:`, result);

            expect(result).to.be.an('object');
            expect(result).to.have.property('name');
            expect(result).to.have.property('type');
            expect(result).to.have.property('abilities');
            expect(result).to.have.property('habitat');
            expect(result.abilities).to.be.an('array');
        });

        it('should return structured JSON with KimiK2', async function () {
            const model = ModelMix.new(setup).kimiK2();

            model.addText('Generate information about a fictional vehicle.');

            const result = await model.json({
                name: "Flying Car",
                type: "Transportation",
                features: ["Anti-gravity", "Auto-pilot"],
                manufacturer: "Future Motors"
            });

            console.log(`KimiK2 JSON result:`, result);

            expect(result).to.be.an('object');
            expect(result).to.have.property('name');
            expect(result).to.have.property('type');
            expect(result).to.have.property('features');
            expect(result).to.have.property('manufacturer');
            expect(result.features).to.be.an('array');
        });

        it('should return structured JSON with GPT-OSS', async function () {
            const model = ModelMix.new(setup).gptOss();

            model.addText('Generate information about a fictional planet.');

            const result = await model.json({
                name: "Nova Prime",
                type: "Gas Giant",
                moons: ["Alpha", "Beta", "Gamma"],
                atmosphere: "Hydrogen and Helium"
            });

            console.log(`GPT-OSS JSON result:`, result);

            expect(result).to.be.an('object');
            expect(result).to.have.property('name');
            expect(result).to.have.property('type');
            expect(result).to.have.property('moons');
            expect(result).to.have.property('atmosphere');
            expect(result.moons).to.be.an('array');
        });

        it('should return structured JSON with Grok3Mini', async function () {
            const model = ModelMix.new(setup).grok3mini();

            model.addText('Generate information about a fictional technology.');

            const result = await model.json({
                name: "Quantum Computer",
                type: "Computing",
                applications: ["Cryptography", "Simulation"],
                power: "1000 qubits"
            });

            console.log(`Grok3Mini JSON result:`, result);

            expect(result).to.be.an('object');
            expect(result).to.have.property('name');
            expect(result).to.have.property('type');
            expect(result).to.have.property('applications');
            expect(result).to.have.property('power');
            expect(result.applications).to.be.an('array');
        });

    });


});