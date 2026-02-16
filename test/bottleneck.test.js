const { expect } = require('chai');
const sinon = require('sinon');
const nock = require('nock');
const { ModelMix } = require('../index.js');
const Bottleneck = require('bottleneck');

describe('Rate Limiting with Bottleneck Tests', () => {
    
    // Setup test hooks
    if (global.setupTestHooks) {
        global.setupTestHooks();
    }
    
    afterEach(() => {
        nock.cleanAll();
        sinon.restore();
    });

    describe('Default Bottleneck Configuration', () => {
        it('should initialize with default bottleneck settings', () => {
            const model = ModelMix.new();
            
            expect(model.config.bottleneck).to.deep.equal({
                maxConcurrent: 8,
                minTime: 500
            });
            
            expect(model.limiter).to.be.instanceOf(Bottleneck);
        });

        it('should apply custom bottleneck configuration', () => {
            const customConfig = {
                maxConcurrent: 2,
                minTime: 1000,
                reservoir: 10,
                reservoirRefreshInterval: 60000,
                reservoirRefreshAmount: 10
            };
            
            const model = ModelMix.new({
                config: {
                    bottleneck: customConfig
                }
            });
            
            expect(model.config.bottleneck).to.deep.equal(customConfig);
        });
    });

    describe('Rate Limiting in Action', () => {
        let model;

        beforeEach(() => {
            model = ModelMix.new({
                config: {
                    debug: false,
                    bottleneck: {
                        maxConcurrent: 1,
                        minTime: 100 // Reduced for faster tests
                    }
                }
            });
        });

        afterEach(async () => {
            // Clean up bottleneck state
            if (model && model.limiter) {
                await model.limiter.stop({ dropWaitingJobs: true });
            }
        });

        it('should enforce minimum time between requests', async () => {
            const startTimes = [];
            
            model.gpt41();
            
            // Mock API responses
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .times(3)
                .reply(function() {
                    startTimes.push(Date.now());
                    return [200, {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: `Response ${startTimes.length}`
                            }
                        }]
                    }];
                });

            // Start three requests sequentially to test rate limiting
            const start = Date.now();
            
            const result1 = await model.addText('Request 1').message();
            const result2 = await model.addText('Request 2').message();
            const result3 = await model.addText('Request 3').message();
            
            const totalTime = Date.now() - start;
            
            expect(result1).to.include('Response 1');
            expect(result2).to.include('Response 2');
            expect(result3).to.include('Response 3');
            expect(startTimes).to.have.length(3);
            
            // With minTime of 100ms, 3 requests should take at least 200ms (100ms between each)
            expect(totalTime).to.be.at.least(200);
        });

        it('should limit concurrent requests', async () => {
            let concurrentCount = 0;
            let maxConcurrent = 0;
            
            model = ModelMix.new({
                config: {
                    debug: false,
                    max_history: -1, // concurrent calls need history to preserve queued messages
                    bottleneck: {
                        maxConcurrent: 2,
                        minTime: 50
                    }
                }
            });
            
            model.gpt41();
            
            // Mock API with delay to simulate concurrent requests
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .times(5)
                .reply(function() {
                    concurrentCount++;
                    maxConcurrent = Math.max(maxConcurrent, concurrentCount);
                    
                    return new Promise(resolve => {
                        setTimeout(() => {
                            concurrentCount--;
                            resolve([200, {
                                choices: [{
                                    message: {
                                        role: 'assistant',
                                        content: 'Concurrent response'
                                    }
                                }]
                            }]);
                        }, 100);
                    });
                });

            // Start 5 requests simultaneously
            const promises = Array.from({ length: 5 }, (_, i) => 
                model.addText(`Concurrent request ${i + 1}`).message()
            );

            await Promise.all(promises);
            
            // Should never exceed maxConcurrent of 2
            expect(maxConcurrent).to.be.at.most(2);
        });
    });

    describe('Rate Limiting with Different Providers', () => {
        let model;

        beforeEach(() => {
            model = ModelMix.new({
                config: {
                    debug: false,
                    bottleneck: {
                        maxConcurrent: 1,
                        minTime: 500
                    }
                }
            });
        });

        afterEach(async () => {
            // Clean up bottleneck state
            if (model && model.limiter) {
                await model.limiter.stop({ dropWaitingJobs: true });
            }
        });

        it('should apply rate limiting to OpenAI requests', async () => {
            const requestTimes = [];
            
            model.gpt41();
            
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .times(2)
                .reply(function() {
                    requestTimes.push(Date.now());
                    return [200, {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: 'OpenAI rate limited response'
                            }
                        }]
                    }];
                });

            const start = Date.now();
            
            await model.addText('First request').message();
            await model.addText('Second request').message();
            
            const totalTime = Date.now() - start;
            
            // Should take at least 500ms due to rate limiting
            expect(totalTime).to.be.at.least(500);
        });

        it('should apply rate limiting to Anthropic requests', async () => {
            const requestTimes = [];
            
            model.sonnet4();
            
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .times(2)
                .reply(function() {
                    requestTimes.push(Date.now());
                    return [200, {
                        content: [{
                            type: 'text',
                            text: 'Anthropic rate limited response'
                        }]
                    }];
                });

            const start = Date.now();
            
            await model.addText('First request').message();
            await model.addText('Second request').message();
            
            const totalTime = Date.now() - start;
            
            // Should take at least 500ms due to rate limiting
            expect(totalTime).to.be.at.least(500);
        });


    });

    describe('Bottleneck Error Handling', () => {
        let model;

        beforeEach(() => {
            model = ModelMix.new({
                config: {
                    debug: false,
                    bottleneck: {
                        maxConcurrent: 1,
                        minTime: 100
                    }
                }
            });
        });

        afterEach(async () => {
            // Clean up bottleneck state
            if (model && model.limiter) {
                await model.limiter.stop({ dropWaitingJobs: true });
            }
        });

        it('should handle rate limiting with API errors', async () => {
            model.gpt41();
            
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(429, {
                    error: {
                        message: 'Rate limit exceeded',
                        type: 'rate_limit_error'
                    }
                });

            try {
                await model.addText('Rate limited request').message();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('429');
            }
        });

        it('should continue rate limiting after errors', async () => {
            const requestTimes = [];
            
            model.gpt41();
            
            // First request fails
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(function() {
                    requestTimes.push(Date.now());
                    return [500, { error: 'Server error' }];
                });
            
            // Second request succeeds
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(function() {
                    requestTimes.push(Date.now());
                    return [200, {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: 'Success after error'
                            }
                        }]
                    }];
                });

            const start = Date.now();
            
            try {
                await model.addText('Failing request').message();
            } catch (error) {
                // Expected to fail
            }
            
            const response = await model.addText('Success request').message();
            const totalTime = Date.now() - start;
            
            expect(response).to.include('Success after error');
            expect(totalTime).to.be.at.least(100); // Rate limiting still applied
        });
    });

    describe('Advanced Bottleneck Features', () => {
        it('should handle reservoir-based rate limiting', async () => {
            const model = ModelMix.new({
                config: {
                    debug: false,
                    max_history: -1,
                    bottleneck: {
                        maxConcurrent: 5,
                        minTime: 100,
                        reservoir: 3, // Only 3 requests allowed initially
                        reservoirRefreshInterval: 2000, // Refresh every 2 seconds
                        reservoirRefreshAmount: 2 // Add 2 more requests
                    }
                }
            });
            
            model.gpt41();
            
            let requestCount = 0;
            
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .times(5)
                .reply(function() {
                    requestCount++;
                    return [200, {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: `Response ${requestCount}`
                            }
                        }]
                    }];
                });

            const startTime = Date.now();
            
            // Try to make 5 requests (should be limited by reservoir)
            const promises = Array.from({ length: 5 }, (_, i) => 
                model.addText(`Request ${i + 1}`).message()
            );

            const results = await Promise.all(promises);
            const endTime = Date.now();
            
            expect(results).to.have.length(5);
            
            // With reservoir of 3 and refresh of 2 after 2 seconds, 
            // all 5 requests should complete but take some time
            expect(endTime - startTime).to.be.at.least(2000);
        });

        it('should handle priority queuing', async () => {
            const model = ModelMix.new({
                config: {
                    debug: false,
                    max_history: -1,
                    bottleneck: {
                        maxConcurrent: 1,
                        minTime: 200
                    }
                }
            });
            
            model.gpt41();
            
            const results = [];
            
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .times(3)
                .reply(function(uri, body) {
                    const content = body.messages[0].content;
                    results.push(content);
                    return [200, {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: `Processed: ${content}`
                            }
                        }]
                    }];
                });

            // Submit requests with different priorities
            // (Note: Bottleneck priority requires custom implementation)
            const promises = [
                model.addText('Low priority').message(),
                model.addText('High priority').message(),
                model.addText('Medium priority').message()
            ];

            await Promise.all(promises);
            
            expect(results).to.have.length(3);
            // Results should be processed in submission order due to rate limiting
        });
    });

    describe('Bottleneck Performance', () => {
        it('should track bottleneck statistics', async () => {
            const model = ModelMix.new({
                config: {
                    debug: false,
                    max_history: -1,
                    bottleneck: {
                        maxConcurrent: 2,
                        minTime: 100,
                        trackDoneStatus: true
                    }
                }
            });
            
            model.gpt41();
            
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .times(3)
                .reply(200, {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: 'Statistics tracking response'
                        }
                    }]
                });

            // Make multiple requests
            await Promise.all([
                model.addText('Request 1').message(),
                model.addText('Request 2').message(),
                model.addText('Request 3').message()
            ]);

            // Check bottleneck counts
            const counts = model.limiter.counts();
            expect(counts).to.have.property('RECEIVED');
            expect(counts).to.have.property('QUEUED');
            expect(counts).to.have.property('RUNNING');
            expect(counts).to.have.property('EXECUTING');
        });

        it('should handle bottleneck events', (done) => {
            const model = ModelMix.new({
                config: {
                    debug: false,
                    bottleneck: {
                        maxConcurrent: 1,
                        minTime: 100
                    }
                }
            });
            
            let eventFired = false;
            
            // Listen for bottleneck events
            model.limiter.on('idle', () => {
                eventFired = true;
                expect(eventFired).to.be.true;
                done();
            });
            
            model.gpt41();
            
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: 'Event handling response'
                        }
                    }]
                });

            // Make a request to trigger events
            model.addText('Event test').message();
        });
    });
});