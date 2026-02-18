/**
 * Global test setup for ModelMix
 * 
 * This file contains shared configuration and utilities for all test files.
 * It runs before each test suite and sets up the testing environment.
 */

// Load .env file if present (native Node.js, no dotenv dependency required)
try { process.loadEnvFile(); } catch {}

// Set dummy environment variables for testing to prevent library errors

const chai = require('chai');
const sinon = require('sinon');
const nock = require('nock');

// Set up chai
chai.config.includeStack = true;
chai.config.showDiff = true;

// Global test timeout
const TIMEOUT = 10000;

// Set dummy environment variables for testing to prevent library initialization errors
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'sk-ant-test-dummy-key-for-testing-purposes';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-proj-test-dummy-key-for-testing-purposes';
process.env.PPLX_API_KEY = process.env.PPLX_API_KEY || 'pplx-test-dummy-key-for-testing-purposes';
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'gsk_test-dummy-key-for-testing-purposes';
process.env.TOGETHER_API_KEY = process.env.TOGETHER_API_KEY || '49a96test-dummy-key-for-testing-purposes';
process.env.XAI_API_KEY = process.env.XAI_API_KEY || 'xai-test-dummy-key-for-testing-purposes';
process.env.CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || 'csk-test-dummy-key-for-testing-purposes';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzatest-dummy-key-for-testing-purposes';
process.env.LAMBDA_API_KEY = process.env.LAMBDA_API_KEY || 'secret_test-dummy-key-for-testing-purposes';
process.env.BRAVE_API_KEY = process.env.BRAVE_API_KEY || 'BSA0test-dummy-key-for-testing-purposes_fm';

// Global test configuration
global.TEST_CONFIG = {
    TIMEOUT,
    MOCK_APIS: true,
    DEBUG: false
};

// Global cleanup function
global.cleanup = function() {
    // More thorough nock cleanup
    nock.cleanAll();
    nock.restore();
    nock.activate();
    sinon.restore();
    
    // Clear any pending timers and intervals
    const highestTimeoutId = setTimeout(() => {}, 0);
    clearTimeout(highestTimeoutId);
    for (let i = 0; i < highestTimeoutId; i++) {
        clearTimeout(i);
        clearInterval(i);
    }
    
    // Force garbage collection if available
    if (global.gc) {
        global.gc();
    }
};

// Console override for testing (suppress debug logs unless needed)
if (!process.env.DEBUG_TESTS) {
    const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug
    };
    
    // Suppress most console output during tests
    console.log = () => {};
    console.info = () => {};
    console.debug = () => {};
    
    // Keep warnings and errors visible
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    
    // Restore original console for specific test debugging
    global.restoreConsole = () => {
        Object.assign(console, originalConsole);
    };
}

// Utility functions for tests
global.testUtils = {
    /**
     * Create a mock API response for different providers
     */
    createMockResponse: (provider, content, options = {}) => {
        switch (provider) {
            case 'openai':
                return {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: content,
                            ...options
                        }
                    }]
                };
                
            case 'anthropic':
                return {
                    content: [{
                        type: 'text',
                        text: content,
                        ...options
                    }]
                };
                
            case 'google':
                return {
                    candidates: [{
                        content: {
                            parts: [{
                                text: content,
                                ...options
                            }]
                        }
                    }]
                };
                
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    },

    /**
     * Create a mock error response
     */
    createMockError: (statusCode, message) => ({
        error: {
            message: message,
            type: 'test_error',
            code: statusCode
        }
    }),

    /**
     * Wait for a specified amount of time
     */
    wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

    /**
     * Generate test image data
     */
    generateTestImage: (format = 'jpeg') => {
        const formats = {
            jpeg: '/9j/4AAQSkZJRgABAQAAAQABAAD//2Q==',
            png: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            gif: 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
        };
        
        const mimeTypes = {
            jpeg: 'image/jpeg',
            png: 'image/png', 
            gif: 'image/gif'
        };
        
        return `data:${mimeTypes[format]};base64,${formats[format]}`;
    }
};

// Export hooks for tests to use
global.setupTestHooks = function() {
    beforeEach(() => {
        // Ensure clean state before each test
        nock.cleanAll();
        sinon.restore();
        
        // Disable real HTTP requests
        if (global.TEST_CONFIG.MOCK_APIS) {
            nock.disableNetConnect();
            // Allow localhost connections for local servers if needed
            nock.enableNetConnect('localhost');
        }
    });

    afterEach(() => {
        global.cleanup();
        
        if (global.TEST_CONFIG.MOCK_APIS) {
            nock.enableNetConnect();
        }
        
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }
    });
};

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('✅ ModelMix test setup complete');