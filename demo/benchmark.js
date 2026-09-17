import { ModelMix } from '../index.js';
import benchmarkPlugin from '../plugins/benchmark/index.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try { process.loadEnvFile(); } catch {}

const { benchmark } = benchmarkPlugin;

const task = await readFile(process.argv[2] || new URL('./prompts/story.txt', import.meta.url), 'utf8');

const models = [
    // 'opus50@20',
    'gpt6astra@0',
    'gpt6astra@20',
    'gpt56sol@40',
    // 'gemini38flash@20',
    // 'grok46@20',
    'deepseekV41Flash@60'
];

console.log(`Running benchmark: ${models.length} models, 26 sequential model calls.`);

const report = await ModelMix.new({
    config: { debug: 1 },
    options: { max_tokens: 65536 }
})
    .use(benchmark({
        criteriaModel: 'opus50@20',
        models,
        mix: { deepseek: true, openrouter: false }
    }))
    .assign({ task })
    .addText('<%- task %>')
    .json();

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const demoDirectory = path.dirname(fileURLToPath(import.meta.url));
const resultsDirectory = path.join(demoDirectory, 'results', runId);
await mkdir(resultsDirectory, { recursive: true });

for (const result of report.results) {
    if (result.response === null) continue;
    const filename = result.id.replace(/[^A-Za-z0-9_-]/g, '_');
    const contents = `# ${result.id}\n\nScore: ${result.score === null ? 'N/A' : Math.round(result.score * 10)}/100\n\nEstimated generation cost (USD): ${result.responseMetrics?.cost ?? 'N/A'}\n\n---\n\n${result.response}\n`;
    await writeFile(path.join(resultsDirectory, `${filename}.md`), contents, 'utf8');
}

await writeFile(
    path.join(resultsDirectory, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
);

const ranking = report.results
    .map(result => ({
        model: result.id,
        score: result.score,
        cost: result.responseMetrics?.cost?.toFixed(2) ?? 'N/A',
        timeSeconds: Number.isFinite(result.responseMetrics?.elapsedMs)
            ? (result.responseMetrics.elapsedMs / 1000).toFixed(2)
            : 'N/A',
        evaluations: `${result.evaluationCount.valid}/${result.evaluationCount.expected}`
    }))
    .sort((left, right) => {
        if (left.score === right.score) return 0;
        if (left.score === null) return 1;
        if (right.score === null) return -1;
        return right.score - left.score;
    })
    .map(row => ({ ...row, score: row.score === null ? null : Math.round(row.score * 10) }));

console.table(ranking);
if (report.errors.length > 0) {
    console.table(report.errors.map(({ stage, participant, judge, error }) => ({
        stage,
        participant,
        judge,
        error: error.details?.error?.message ?? error.message
    })));
}
console.log(`Full responses and report saved to ${resultsDirectory}`);
