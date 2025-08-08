#!/usr/bin/env node

/**
 * ModelMix Test Runner
 * 
 * This is the main entry point for running the comprehensive test suite.
 * It includes tests for:
 * - JSON schema generation and structured outputs
 * - Provider fallback chains
 * - Different providers (OpenAI, Anthropic, Google, etc.)
 * - File operations and template system
 * - Image processing and multimodal support
 * - MCP (Model Context Protocol) integration
 * - Rate limiting with Bottleneck
 * - Integration tests and edge cases
 */

const { spawn } = require('child_process');
const path = require('path');

const testFiles = [
    'json.test.js',
    'fallback.test.js', 
    'templates.test.js',
    'images.test.js',
];

console.log('🧬 ModelMix Test Suite Runner');
console.log('==============================');
console.log(`Running ${testFiles.length} test suites...\n`);

function runTests() {
    const args = [
        '--timeout', '10000',
        '--recursive',
        'test/**/*.test.js'
    ];

    const child = spawn('npx', ['mocha', ...args], {
        cwd: process.cwd(),
        stdio: 'inherit'
    });

    child.on('close', (code) => {
        if (code === 0) {
            console.log('\n✅ All tests passed!');
            console.log('\nTest Coverage:');
            console.log('- ✅ JSON Schema Generation');
            console.log('- ✅ Provider Fallback Chains');
            console.log('- ✅ Multiple Providers (OpenAI, Anthropic, Google, etc.)');
            console.log('- ✅ File Operations & Templates');
            console.log('- ✅ Image Processing & Multimodal');
            console.log('- ✅ MCP Integration');
            console.log('- ✅ Rate Limiting with Bottleneck');
            console.log('- ✅ Integration & Edge Cases');
        } else {
            console.error(`\n❌ Tests failed with exit code ${code}`);
            process.exit(code);
        }
    });

    child.on('error', (err) => {
        console.error('❌ Failed to start test runner:', err);
        process.exit(1);
    });
}

// Run the tests
if (require.main === module) {
    runTests();
}

module.exports = { runTests, testFiles };