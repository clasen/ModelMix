const { expect } = require('chai');
const sinon = require('sinon');
const nock = require('nock');
const { ModelMix } = require('../index.js');

describe('Conversation History Tests', () => {

    if (global.setupTestHooks) {
        global.setupTestHooks();
    }

    afterEach(() => {
        nock.cleanAll();
        sinon.restore();
    });

    describe('Assistant Response Persistence', () => {
        let model;

        beforeEach(() => {
            model = ModelMix.new({
                config: { debug: false, max_history: 10 }
            });
        });

        it('should add assistant response to message history after message()', async () => {
            model.gpt5mini().addText('Hello');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: 'Hi there!'
                        }
                    }]
                });

            await model.message();

            // After the call, messages should contain both user and assistant
            expect(model.messages).to.have.length(2);
            expect(model.messages[0].role).to.equal('user');
            expect(model.messages[1].role).to.equal('assistant');
            expect(model.messages[1].content[0].text).to.equal('Hi there!');
        });

        it('should add assistant response to message history after raw()', async () => {
            model.sonnet46().addText('Hello');

            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(200, {
                    content: [{
                        type: 'text',
                        text: 'Hi from Claude!'
                    }]
                });

            await model.raw();

            expect(model.messages).to.have.length(2);
            expect(model.messages[0].role).to.equal('user');
            expect(model.messages[1].role).to.equal('assistant');
            expect(model.messages[1].content[0].text).to.equal('Hi from Claude!');
        });
    });

    describe('Multi-turn Conversations', () => {

        it('should include previous assistant response in second API call (OpenAI)', async () => {
            const model = ModelMix.new({
                config: { debug: false, max_history: 10 }
            });
            model.gpt5mini();

            // First turn
            model.addText('Capital of France?');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: 'The capital of France is Paris.'
                        }
                    }]
                });

            await model.message();

            // Second turn - capture the request body to verify history
            let capturedBody;
            nock('https://api.openai.com')
                .post('/v1/chat/completions', (body) => {
                    capturedBody = body;
                    return true;
                })
                .reply(200, {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: 'The capital of Germany is Berlin.'
                        }
                    }]
                });

            model.addText('Capital of Germany?');
            await model.message();

            // Verify the second request includes system + user + assistant + user
            expect(capturedBody.messages).to.have.length(4); // system + 3 conversation messages
            expect(capturedBody.messages[0].role).to.equal('system');
            expect(capturedBody.messages[1].role).to.equal('user');
            expect(capturedBody.messages[2].role).to.equal('assistant');
            // OpenAI content is an array of {type, text} objects
            const assistantContent = capturedBody.messages[2].content;
            const assistantText = Array.isArray(assistantContent)
                ? assistantContent[0].text
                : assistantContent;
            expect(assistantText).to.include('Paris');
            expect(capturedBody.messages[3].role).to.equal('user');
        });

        it('should include previous assistant response in second API call (Anthropic)', async () => {
            const model = ModelMix.new({
                config: { debug: false, max_history: 10 }
            });
            model.sonnet46();

            // First turn
            model.addText('Capital of France?');

            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(200, {
                    content: [{
                        type: 'text',
                        text: 'The capital of France is Paris.'
                    }]
                });

            await model.message();

            // Second turn - capture the request body
            let capturedBody;
            nock('https://api.anthropic.com')
                .post('/v1/messages', (body) => {
                    capturedBody = body;
                    return true;
                })
                .reply(200, {
                    content: [{
                        type: 'text',
                        text: 'The capital of Germany is Berlin.'
                    }]
                });

            model.addText('Capital of Germany?');
            await model.message();

            // Anthropic: system is separate, messages should be user/assistant/user
            expect(capturedBody.messages).to.have.length(3);
            expect(capturedBody.messages[0].role).to.equal('user');
            expect(capturedBody.messages[1].role).to.equal('assistant');
            expect(capturedBody.messages[1].content[0].text).to.include('Paris');
            expect(capturedBody.messages[2].role).to.equal('user');
        });

        it('should not merge consecutive user messages when assistant response is between them', async () => {
            const model = ModelMix.new({
                config: { debug: false, max_history: 10 }
            });
            model.gpt5mini();

            model.addText('First question');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: 'First answer'
                        }
                    }]
                });

            await model.message();

            // Capture second request
            let capturedBody;
            nock('https://api.openai.com')
                .post('/v1/chat/completions', (body) => {
                    capturedBody = body;
                    return true;
                })
                .reply(200, {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: 'Second answer'
                        }
                    }]
                });

            model.addText('Second question');
            await model.message();

            // The two user messages must NOT be merged into one
            const userMessages = capturedBody.messages.filter(m => m.role === 'user');
            expect(userMessages).to.have.length(2);
            expect(userMessages[0].content[0].text).to.equal('First question');
            expect(userMessages[1].content[0].text).to.equal('Second question');
        });

        it('should maintain correct alternating roles across 3 turns', async () => {
            const model = ModelMix.new({
                config: { debug: false, max_history: 20 }
            });
            model.gpt5mini();

            const turns = [
                { user: 'Question 1', assistant: 'Answer 1' },
                { user: 'Question 2', assistant: 'Answer 2' },
                { user: 'Question 3', assistant: 'Answer 3' },
            ];

            let capturedBody;

            for (const turn of turns) {
                model.addText(turn.user);

                nock('https://api.openai.com')
                    .post('/v1/chat/completions', (body) => {
                        capturedBody = body;
                        return true;
                    })
                    .reply(200, {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: turn.assistant
                            }
                        }]
                    });

                await model.message();
            }

            // After 3 turns, the last request should have system + 5 messages (u/a/u/a/u)
            const msgs = capturedBody.messages.filter(m => m.role !== 'system');
            expect(msgs).to.have.length(5);
            expect(msgs.map(m => m.role)).to.deep.equal([
                'user', 'assistant', 'user', 'assistant', 'user'
            ]);
        });
    });

    describe('max_history Limits', () => {

        it('should be stateless with max_history=0 (default)', async () => {
            const model = ModelMix.new({
                config: { debug: false } // max_history defaults to 0
            });
            model.gpt5mini();

            model.addText('Question 1');
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: { role: 'assistant', content: 'Answer 1' }
                    }]
                });
            await model.message();

            // After call, messages should be cleared (stateless)
            expect(model.messages).to.have.length(0);
        });

        it('should not send history on second call with max_history=0', async () => {
            const model = ModelMix.new({
                config: { debug: false, max_history: 0 }
            });
            model.gpt5mini();

            // First turn
            model.addText('Question 1');
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: { role: 'assistant', content: 'Answer 1' }
                    }]
                });
            await model.message();

            // Second turn - capture request
            let capturedBody;
            model.addText('Question 2');
            nock('https://api.openai.com')
                .post('/v1/chat/completions', (body) => {
                    capturedBody = body;
                    return true;
                })
                .reply(200, {
                    choices: [{
                        message: { role: 'assistant', content: 'Answer 2' }
                    }]
                });
            await model.message();

            // Only system + current user message, no history from turn 1
            const msgs = capturedBody.messages.filter(m => m.role !== 'system');
            expect(msgs).to.have.length(1);
            expect(msgs[0].role).to.equal('user');
            expect(msgs[0].content[0].text).to.equal('Question 2');
        });

        it('should trim old messages when max_history is reached', async () => {
            const model = ModelMix.new({
                config: { debug: false, max_history: 2 }
            });
            model.gpt5mini();

            // Turn 1
            model.addText('Question 1');
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: { role: 'assistant', content: 'Answer 1' }
                    }]
                });
            await model.message();

            // Turn 2 - capture request
            let capturedBody;
            model.addText('Question 2');
            nock('https://api.openai.com')
                .post('/v1/chat/completions', (body) => {
                    capturedBody = body;
                    return true;
                })
                .reply(200, {
                    choices: [{
                        message: { role: 'assistant', content: 'Answer 2' }
                    }]
                });
            await model.message();

            // With max_history=2, only the last 2 messages should be sent (assistant + user)
            const msgs = capturedBody.messages.filter(m => m.role !== 'system');
            expect(msgs.length).to.be.at.most(2);
            // The last message should be the current user question
            expect(msgs[msgs.length - 1].role).to.equal('user');
            expect(msgs[msgs.length - 1].content[0].text).to.equal('Question 2');
        });

        it('should keep full history when max_history is large enough', async () => {
            const model = ModelMix.new({
                config: { debug: false, max_history: 100 }
            });
            model.gpt5mini();

            // Turn 1
            model.addText('Q1');
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: { role: 'assistant', content: 'A1' }
                    }]
                });
            await model.message();

            // Turn 2
            let capturedBody;
            model.addText('Q2');
            nock('https://api.openai.com')
                .post('/v1/chat/completions', (body) => {
                    capturedBody = body;
                    return true;
                })
                .reply(200, {
                    choices: [{
                        message: { role: 'assistant', content: 'A2' }
                    }]
                });
            await model.message();

            // All 3 messages should be present (user, assistant, user)
            const msgs = capturedBody.messages.filter(m => m.role !== 'system');
            expect(msgs).to.have.length(3);
        });

        it('should handle max_history=-1 (unlimited)', async () => {
            const model = ModelMix.new({
                config: { debug: false, max_history: -1 }
            });
            model.gpt5mini();

            for (let i = 1; i <= 5; i++) {
                model.addText(`Question ${i}`);
                nock('https://api.openai.com')
                    .post('/v1/chat/completions')
                    .reply(200, {
                        choices: [{
                            message: { role: 'assistant', content: `Answer ${i}` }
                        }]
                    });
                await model.message();
            }

            // After 5 turns, all 10 messages should be in history (5 user + 5 assistant)
            expect(model.messages).to.have.length(10);
        });
    });

    describe('Cross-provider History', () => {

        it('should maintain history when using Anthropic provider', async () => {
            const model = ModelMix.new({
                config: { debug: false, max_history: 10 }
            });
            model.haiku45();

            model.addText('Hello');
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(200, {
                    content: [{ type: 'text', text: 'Hi there!' }]
                });
            await model.message();

            let capturedBody;
            model.addText('How are you?');
            nock('https://api.anthropic.com')
                .post('/v1/messages', (body) => {
                    capturedBody = body;
                    return true;
                })
                .reply(200, {
                    content: [{ type: 'text', text: 'I am well!' }]
                });
            await model.message();

            // Anthropic sends system separately; messages should be u/a/u
            expect(capturedBody.messages).to.have.length(3);
            expect(capturedBody.messages[0].role).to.equal('user');
            expect(capturedBody.messages[1].role).to.equal('assistant');
            expect(capturedBody.messages[1].content[0].text).to.equal('Hi there!');
            expect(capturedBody.messages[2].role).to.equal('user');
        });

        it('should maintain history when using Google provider', async () => {
            const model = ModelMix.new({
                config: { debug: false, max_history: 10 }
            });
            model.gemini3flash();

            model.addText('Hello');
            nock('https://generativelanguage.googleapis.com')
                .post(/.*generateContent/)
                .reply(200, {
                    candidates: [{
                        content: {
                            parts: [{ text: 'Hi from Gemini!' }]
                        }
                    }]
                });
            await model.message();

            let capturedBody;
            model.addText('How are you?');
            nock('https://generativelanguage.googleapis.com')
                .post(/.*generateContent/, (body) => {
                    capturedBody = body;
                    return true;
                })
                .reply(200, {
                    candidates: [{
                        content: {
                            parts: [{ text: 'Great, thanks!' }]
                        }
                    }]
                });
            await model.message();

            // Google sends messages in contents array with user/model roles
            const userMsgs = capturedBody.contents.filter(m => m.role === 'user');
            const modelMsgs = capturedBody.contents.filter(m => m.role === 'model');
            expect(userMsgs).to.have.length(2);
            expect(modelMsgs).to.have.length(1);
        });
    });

    describe('Edge Cases', () => {

        it('should handle single turn without breaking', async () => {
            const model = ModelMix.new({
                config: { debug: false, max_history: 10 }
            });
            model.gpt5mini().addText('Just one question');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: { role: 'assistant', content: 'Just one answer' }
                    }]
                });

            const response = await model.message();
            expect(response).to.equal('Just one answer');
            expect(model.messages).to.have.length(2);
        });

        it('should handle empty assistant response gracefully', async () => {
            const model = ModelMix.new({
                config: { debug: false, max_history: 10 }
            });
            model.gpt5mini().addText('Hello');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: { role: 'assistant', content: '' }
                    }]
                });

            const response = await model.message();
            // Empty string is falsy, so assistant message should NOT be added
            expect(response).to.equal('');
        });

        it('should handle multiple addText before first message()', async () => {
            const model = ModelMix.new({
                config: { debug: false, max_history: 10 }
            });
            model.gpt5mini();

            model.addText('Part 1');
            model.addText('Part 2');

            let capturedBody;
            nock('https://api.openai.com')
                .post('/v1/chat/completions', (body) => {
                    capturedBody = body;
                    return true;
                })
                .reply(200, {
                    choices: [{
                        message: { role: 'assistant', content: 'Response' }
                    }]
                });

            await model.message();

            // Two consecutive user messages should be grouped into one by groupByRoles
            const userMsgs = capturedBody.messages.filter(m => m.role === 'user');
            expect(userMsgs).to.have.length(1);
            expect(userMsgs[0].content).to.have.length(2);
            expect(userMsgs[0].content[0].text).to.equal('Part 1');
            expect(userMsgs[0].content[1].text).to.equal('Part 2');
        });
    });
});
