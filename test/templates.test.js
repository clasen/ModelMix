const { expect } = require('chai');
const sinon = require('sinon');
const nock = require('nock');
const fs = require('fs');
const path = require('path');
const { ModelMix } = require('../index.js');

describe('Template and File Operations Tests', () => {
    
    // Setup test hooks
    if (global.setupTestHooks) {
        global.setupTestHooks();
    }

    afterEach(() => {
        nock.cleanAll();
        sinon.restore();
    });

    describe('Template Replacement', () => {
        let model;

        beforeEach(() => {
            model = ModelMix.new({
                config: { debug: false }
            });
        });

        it('should replace simple template variables', async () => {
            model.gpt41()
                .replace({
                    '{{name}}': 'Alice',
                    '{{age}}': '30',
                    '{{city}}': 'New York'
                })
                .addText('Hello {{name}}, you are {{age}} years old and live in {{city}}.');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(function (uri, body) {

                    expect(body.messages[1].content[0].text).to.equal('Hello Alice, you are 30 years old and live in New York.');

                    return [200, {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: 'Template processed successfully'
                            }
                        }]
                    }];
                });

            const response = await model.message();
            expect(response).to.include('Template processed successfully');
        });

        it('should handle multiple template replacements', async () => {
            model.gpt41()
                .replace({ '{{greeting}}': 'Hello' })
                .replace({ '{{name}}': 'Bob' })
                .replace({ '{{action}}': 'welcome' })
                .addText('{{greeting}} {{name}}, {{action}} to our platform!');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(function (uri, body) {
                    expect(body.messages[1].content[0].text).to.equal('Hello Bob, welcome to our platform!');

                    return [200, {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: 'Multiple templates replaced'
                            }
                        }]
                    }];
                });

            const response = await model.message();
            expect(response).to.include('Multiple templates replaced');
        });

        it('should handle nested template objects', async () => {
            model.gpt41()
                .replace({
                    '{{user_name}}': 'Charlie',
                    '{{user_role}}': 'admin',
                    '{{company_name}}': 'TechCorp',
                    '{{company_domain}}': 'techcorp.com'
                })
                .addText('User {{user_name}} with role {{user_role}} works at {{company_name}} ({{company_domain}})');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(function (uri, body) {
                    expect(body.messages[1].content[0].text).to.equal('User Charlie with role admin works at TechCorp (techcorp.com)');

                    return [200, {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: 'Nested templates working'
                            }
                        }]
                    }];
                });

            const response = await model.message();
            expect(response).to.include('Nested templates working');
        });

        it('should preserve unreplaced templates', async () => {
            model.gpt41()
                .replace({ '{{name}}': 'David' })
                .addText('Hello {{name}}, your ID is {{user_id}} and status is {{status}}');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(function (uri, body) {
                    expect(body.messages[1].content[0].text).to.equal('Hello David, your ID is {{user_id}} and status is {{status}}');

                    return [200, {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: 'Partial template replacement'
                            }
                        }]
                    }];
                });

            const response = await model.message();
            expect(response).to.include('Partial template replacement');
        });

        it('should handle empty and special character replacements', async () => {
            model.gpt41()
                .replace({
                    '{{empty}}': '',
                    '{{special}}': 'Hello & "World" <test>',
                    '{{number}}': '42',
                    '{{boolean}}': 'true'
                })
                .addText('Empty: {{empty}}, Special: {{special}}, Number: {{number}}, Boolean: {{boolean}}');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(function (uri, body) {
                    expect(body.messages[1].content[0].text).to.equal('Empty: , Special: Hello & "World" <test>, Number: 42, Boolean: true');

                    return [200, {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: 'Special characters handled'
                            }
                        }]
                    }];
                });

            const response = await model.message();
            expect(response).to.include('Special characters handled');
        });
    });

    describe('File Operations', () => {
        let model;
        const fixturesPath = path.join(__dirname, 'fixtures');

        beforeEach(() => {
            model = ModelMix.new({
                config: { debug: false }
            });
        });

        it('should load and replace from template file', async () => {
            model.gpt41()
                .replaceKeyFromFile('{{template}}', path.join(fixturesPath, 'template.txt'))
                .replace({
                    '{{name}}': 'Eve',
                    '{{platform}}': 'ModelMix',
                    '{{username}}': 'eve_user',
                    '{{role}}': 'developer',
                    '{{created_date}}': '2023-12-01',
                    '{{website}}': 'https://modelmix.dev',
                    '{{company}}': 'AI Solutions'
                })
                .addText('Process this template: {{template}}');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(function (uri, body) {
                    const content = body.messages[1].content[0].text;

                    expect(content).to.include('Hello Eve, welcome to ModelMix!');
                    expect(content).to.include('Username: eve_user');
                    expect(content).to.include('Role: developer');
                    expect(content).to.include('Created: 2023-12-01');
                    expect(content).to.include('The AI Solutions Team');

                    return [200, {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: 'Template file processed'
                            }
                        }]
                    }];
                });

            const response = await model.message();
            expect(response).to.include('Template file processed');
        });

        it('should load and process JSON data file', async () => {
            model.gpt41()
                .replaceKeyFromFile('{{data}}', path.join(fixturesPath, 'data.json'))
                .addText('Process this data: {{data}}');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(function (uri, body) {
                    const content = body.messages[1].content[0].text;

                    expect(content).to.include('Alice Smith');
                    expect(content).to.include('alice@example.com');
                    expect(content).to.include('admin');
                    expect(content).to.include('Bob Johnson');
                    expect(content).to.include('Carol Davis');
                    expect(content).to.include('"theme": "dark"');
                    expect(content).to.include('"version": "1.0.0"');

                    return [200, {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: 'JSON data processed'
                            }
                        }]
                    }];
                });

            const response = await model.message();
            expect(response).to.include('JSON data processed');
        });

        it('should handle file loading errors gracefully', async () => {
            model.gpt41()
                .replaceKeyFromFile('{{missing}}', path.join(fixturesPath, 'nonexistent.txt'))
                .addText('This should contain: {{missing}}');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(function (uri, body) {
                    // The template should remain unreplaced if file doesn't exist
                    expect(body.messages[1].content[0].text).to.equal('This should contain: {{missing}}');

                    return [200, {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: 'File not found handled'
                            }
                        }]
                    }];
                });

            const response = await model.message();
            expect(response).to.include('File not found handled');
        });

        it('should handle multiple file replacements', async () => {
            model.gpt41()
                .replaceKeyFromFile('{{template}}', path.join(fixturesPath, 'template.txt'))
                .replaceKeyFromFile('{{data}}', path.join(fixturesPath, 'data.json'))
                .replace({
                    '{{name}}': 'Frank',
                    '{{platform}}': 'TestPlatform',
                    '{{username}}': 'frank_test',
                    '{{role}}': 'tester',
                    '{{created_date}}': '2023-12-15',
                    '{{website}}': 'https://test.com',
                    '{{company}}': 'Test Corp'
                })
                .addText('Template: {{template}}\n\nData: {{data}}');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(function (uri, body) {
                    const content = body.messages[1].content[0].text;

                    // Should contain processed template
                    expect(content).to.include('Hello Frank, welcome to TestPlatform!');
                    expect(content).to.include('Username: frank_test');

                    // Should contain JSON data
                    expect(content).to.include('Alice Smith');
                    expect(content).to.include('"theme": "dark"');

                    return [200, {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: 'Multiple files processed'
                            }
                        }]
                    }];
                });

            const response = await model.message();
            expect(response).to.include('Multiple files processed');
        });

        it('should handle relative and absolute paths', async () => {
            const absolutePath = path.resolve(fixturesPath, 'template.txt');

            model.gpt41()
                .replaceKeyFromFile('{{absolute}}', absolutePath)
                .replace({
                    '{{name}}': 'Grace',
                    '{{platform}}': 'AbsolutePath',
                    '{{username}}': 'grace_abs',
                    '{{role}}': 'admin',
                    '{{created_date}}': '2023-12-20',
                    '{{website}}': 'https://absolute.com',
                    '{{company}}': 'Absolute Corp'
                })
                .addText('Absolute path content: {{absolute}}');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(function (uri, body) {
                    const content = body.messages[1].content[0].text;

                    expect(content).to.include('Hello Grace, welcome to AbsolutePath!');
                    expect(content).to.include('The Absolute Corp Team');

                    return [200, {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: 'Absolute path works'
                            }
                        }]
                    }];
                });

            const response = await model.message();
            expect(response).to.include('Absolute path works');
        });
    });

    describe('Template and File Integration', () => {
        let model;
        const fixturesPath = path.join(__dirname, 'fixtures');

        beforeEach(() => {
            model = ModelMix.new({
                config: { debug: false }
            });
        });

        it('should combine file loading with template replacement in complex scenarios', async () => {
            model.gpt41()
                .replaceKeyFromFile('{{user_data}}', path.join(fixturesPath, 'data.json'))
                .replace({
                    '{{action}}': 'analyze',
                    '{{target}}': 'user behavior patterns',
                    '{{format}}': 'detailed report'
                })
                .addText('Please {{action}} the following {{target}} and generate a {{format}}:\n\n{{user_data}}');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(function (uri, body) {
                    const content = body.messages[1].content[0].text;

                    expect(content).to.include('Please analyze the following user behavior patterns and generate a detailed report:');
                    expect(content).to.include('Alice Smith');
                    expect(content).to.include('total_users');

                    return [200, {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: 'Complex template integration successful'
                            }
                        }]
                    }];
                });

            const response = await model.message();
            expect(response).to.include('Complex template integration successful');
        });

        it('should handle template chains with JSON output', async () => {
            const schema = {
                summary: 'Analysis summary',
                user_count: 0,
                active_users: 0,
                roles: ['admin', 'user']
            };

            model.gpt41()
                .replaceKeyFromFile('{{data}}', path.join(fixturesPath, 'data.json'))
                .replace({ '{{instruction}}': 'Count active users by role' })
                .addText('{{instruction}} from this data: {{data}}');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(function (uri, body) {
                    expect(body.messages[1].content[0].text).to.include('Count active users by role');
                    expect(body.messages[1].content[0].text).to.include('Alice Smith');

                    return [200, {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: JSON.stringify({
                                    summary: 'User analysis completed',
                                    user_count: 3,
                                    active_users: 2,
                                    roles: ['admin', 'user', 'moderator']
                                })
                            }
                        }]
                    }];
                });

            const result = await model.json(schema);
            expect(result.summary).to.equal('User analysis completed');
            expect(result.user_count).to.equal(3);
            expect(result.active_users).to.equal(2);
            expect(result.roles).to.deep.equal(['admin', 'user', 'moderator']);
        });
    });

    describe('Error Handling', () => {
        let model;

        beforeEach(() => {
            model = ModelMix.new({
                config: { debug: false }
            });
        });

        it('should handle template replacement errors gracefully', () => {
            expect(() => {
                model.gpt41().replace(null);
            }).to.not.throw();

            expect(() => {
                model.gpt41().replace(undefined);
            }).to.not.throw();
        });

        it('should handle file reading errors without crashing', async () => {
            model.gpt41()
                .replaceKeyFromFile('{{bad_file}}', '/path/that/does/not/exist.txt')
                .addText('Content: {{bad_file}}');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: 'Error handled gracefully'
                        }
                    }]
                });

            const response = await model.message();
            expect(response).to.include('Error handled gracefully');
        });
    });
});