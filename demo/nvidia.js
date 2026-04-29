import { ModelMix } from '../index.js';
try { process.loadEnvFile(); } catch { }

const model = ModelMix.new()
    .deepseekV4Flash()
    .addText("Create exactly 5 characters for a narrative game.")

const jsonResult = await model.json([], [{
    name: "character name",
    role: "role in the story",
    trait: "main trait",
    goal: "short character goal"
}]);

console.log(jsonResult);