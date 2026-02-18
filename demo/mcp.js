import { ModelMix } from '../index.js';
try { process.loadEnvFile(); } catch {}

const mmix = ModelMix.new({ config: { max_history: 10 } }).gpt41nano();
mmix.setSystem('You are an assistant and today is ' + new Date().toISOString());

// Add web search capability through MCP
await mmix.addMCP('@modelcontextprotocol/server-brave-search');

mmix.addText('Use Internet: When did the last Christian pope die?');
console.log(await mmix.message());
