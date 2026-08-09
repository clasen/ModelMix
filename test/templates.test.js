const { expect } = require('chai');
const sinon = require('sinon');
const nock = require('nock');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ModelMix } = require('../index.js');

describe('EJS Template and File Operations Tests', () => {
    const fixturesPath = path.join(__dirname, 'fixtures');

    if (global.setupTestHooks) {
        global.setupTestHooks();
    }

    afterEach(() => {
        nock.cleanAll();
        sinon.restore();
    });

    function mockOpenAI(assertRequest, responseText = 'Template processed successfully') {
        nock('https://api.openai.com')
            .post('/v1/responses')
            .reply(function (uri, body) {
                assertRequest(body);
                return [200, testUtils.createMockResponse('openai-responses', responseText)];
            });
    }

    function userTexts(body) {
        return body.input
            .filter(message => message.role === 'user')
            .flatMap(message => message.content)
            .filter(content => content.type === 'input_text')
            .map(content => content.text);
    }

    describe('EJS rendering', () => {
        it('renders inline variables with plain data keys', async () => {
            const model = ModelMix.new()
                .gpt51()
                .assign({ name: 'Alice', age: 30, city: 'New York' })
                .addText('Hello <%- name %>, you are <%- age %> years old and live in <%- city %>.');

            mockOpenAI(body => {
                expect(userTexts(body)).to.deep.equal([
                    'Hello Alice, you are 30 years old and live in New York.'
                ]);
            });

            await model.message();
        });

        it('assigns one template data key', async () => {
            const model = ModelMix.new()
                .gpt51()
                .assignKey('name', 'Martin')
                .addText('Hello <%- name %>.');

            mockOpenAI(body => {
                expect(userTexts(body)).to.deep.equal(['Hello Martin.']);
            });

            await model.message();
        });

        it('supports nested data, conditionals, and loops', async () => {
            const model = ModelMix.new()
                .gpt51()
                .assign({
                    user: {
                        name: 'Charlie',
                        active: true,
                        roles: ['admin', 'reviewer']
                    }
                })
                .addText('<% if (user.active) { %><%- user.name %>: <% user.roles.forEach((role, index) => { %><%= index ? ", " : "" %><%- role %><% }) %><% } %>');

            mockOpenAI(body => {
                expect(userTexts(body)).to.deep.equal(['Charlie: admin, reviewer']);
            });

            await model.message();
        });

        it('keeps raw and XML-escaped output distinct', async () => {
            const value = 'Hello & "World" <test>';
            const model = ModelMix.new()
                .gpt51()
                .assign({ value })
                .addText('Escaped: <%= value %>\nRaw: <%- value %>');

            mockOpenAI(body => {
                expect(userTexts(body)).to.deep.equal([
                    'Escaped: Hello &amp; &#34;World&#34; &lt;test&gt;\nRaw: Hello & "World" <test>'
                ]);
            });

            await model.message();
        });

        it('does not execute EJS received through template data', async () => {
            const model = ModelMix.new()
                .gpt51()
                .assign({ payload: '<%- secret %>', secret: 'must-not-render' })
                .addText('Payload: <%- payload %>');

            mockOpenAI(body => {
                expect(userTexts(body)).to.deep.equal(['Payload: <%- secret %>']);
            });

            await model.message();
        });

        it('selects uniformly when choice options omit weights', async () => {
            const model = ModelMix.new()
                .gpt51()
                .addText(`<% choice %>
<% option %>
Use emojis.
<% option %>
Use few emojis.
<% option %>
Do not use emojis.
<% /choice %>`);
            sinon.stub(model, '_choiceRandom').returns(0.5);

            mockOpenAI(body => {
                expect(userTexts(body)[0].trim()).to.equal('Use few emojis.');
            });

            await model.message();
        });

        it('selects weighted options using relative weights', async () => {
            const model = ModelMix.new()
                .gpt51()
                .assign({ language: 'Spanish' })
                .addText(`<% choice %>
<% option 20 %>
Use emojis in <%- language %>.
<% option 40 %>
Use few emojis in <%- language %>.
<% option 40 %>
Do not use emojis in <%- language %>.
<% /choice %>`);
            sinon.stub(model, '_choiceRandom').returns(0.2);

            mockOpenAI(body => {
                expect(userTexts(body)[0].trim()).to.equal('Use few emojis in Spanish.');
            });

            await model.message();
        });

        it('supports nested choices', async () => {
            const model = ModelMix.new()
                .gpt51()
                .addText(`<% choice %>
<% option %>
Tone:
<% choice %>
<% option %>
formal
<% option %>
casual
<% /choice %>
<% option %>
No tone instruction.
<% /choice %>`);
            const random = sinon.stub(model, '_choiceRandom');
            random.onFirstCall().returns(0.1);
            random.onSecondCall().returns(0.9);

            mockOpenAI(body => {
                expect(userTexts(body)[0].trim()).to.equal('Tone:\ncasual');
            });

            await model.message();
            expect(random.callCount).to.equal(2);
        });

        it('rerolls choices on each new request', async () => {
            const template = `<% choice %>
<% option %>
first
<% option %>
second
<% /choice %>`;
            const model = ModelMix.new().gpt51().addText(template);
            const random = sinon.stub(model, '_choiceRandom');
            random.onFirstCall().returns(0.1);
            random.onSecondCall().returns(0.9);

            mockOpenAI(body => {
                expect(userTexts(body)[0].trim()).to.equal('first');
            }, 'First response');
            await model.message();

            model.addText(template);
            mockOpenAI(body => {
                expect(userTexts(body)[0].trim()).to.equal('second');
            }, 'Second response');
            await model.message();

            expect(random.callCount).to.equal(2);
        });

        it('fails before the request when a variable is missing', async () => {
            const model = ModelMix.new()
                .gpt51()
                .assign({ name: 'David' })
                .addText('Hello <%- name %>, status: <%- status %>');

            let error;
            try {
                await model.message();
            } catch (caught) {
                error = caught;
            }

            expect(error).to.be.instanceOf(Error);
            expect(error.message).to.include('Failed to render message template');
            expect(error.message).to.include('status is not defined');
        });

        it('rejects invalid template data immediately', () => {
            const model = ModelMix.new().gpt51();

            expect(() => model.assign(null)).to.throw(TypeError, 'Template data must be a plain non-null object.');
            expect(() => model.assign(undefined)).to.throw(TypeError, 'Template data must be a plain non-null object.');
            expect(() => model.assign([])).to.throw(TypeError, 'Template data must be a plain non-null object.');
            expect(() => ModelMix.new({ config: { templateData: null } })).to.throw(
                TypeError,
                'Template data must be a plain non-null object.'
            );
            expect(() => model.assign({ $mix: 'reserved' })).to.throw(
                TypeError,
                'Template data key "$mix" is reserved.'
            );
            expect(() => model.assignKey('', 'value')).to.throw(
                TypeError,
                'Template data key must be a non-empty string.'
            );
            expect(() => model.assignKey('$mix', 'value')).to.throw(
                TypeError,
                'Template data key "$mix" is reserved.'
            );
        });

        it('reports malformed choice directives with their source line', async () => {
            const cases = [
                {
                    source: '<% choice %>\n<% option %>\none\n<% option 2 %>\ntwo\n<% /choice %>',
                    message: 'Choice options must either all have weights or all omit them',
                    line: 4
                },
                {
                    source: '<% choice %>\n<% option 0 %>\none\n<% /choice %>',
                    message: 'Choice weight must be a positive finite number',
                    line: 2
                },
                {
                    source: '<% option %>\none',
                    message: 'Option directive must be inside a choice',
                    line: 1
                },
                {
                    source: '<% choice %>\ntext\n<% option %>\none\n<% /choice %>',
                    message: 'Choice content must be inside an option',
                    line: 2
                },
                {
                    source: '<% choice %>\n<% option %>\none',
                    message: 'Unclosed choice directive',
                    line: 1
                }
            ];

            for (const testCase of cases) {
                const model = ModelMix.new().gpt51().addText(testCase.source);
                let error;
                try {
                    await model.message();
                } catch (caught) {
                    error = caught;
                }
                expect(error).to.be.instanceOf(Error);
                expect(error.message).to.include(testCase.message);
                expect(error.message).to.include(`message template at line ${testCase.line}`);
            }
        });

        it('rerolls earlier choices after a later template fails to render', async () => {
            const model = ModelMix.new()
                .gpt51()
                .addText(`<% choice %>
<% option %>
A
<% option %>
B
<% /choice %>`)
                .addText('<%- missing %>');
            const random = sinon.stub(model, '_choiceRandom');
            random.onFirstCall().returns(0.1);
            random.onSecondCall().returns(0.9);

            let error;
            try {
                await model.message();
            } catch (caught) {
                error = caught;
            }
            expect(error).to.be.instanceOf(Error);
            expect(model.messages[0].content[0].text).to.include('<% choice %>');

            model.assign({ missing: 'ready' });
            mockOpenAI(body => {
                const text = userTexts(body).join('\n').trim();
                expect(text).to.include('B');
                expect(text).to.not.include('A');
                expect(text).to.include('ready');
            });
            await model.message();

            expect(random.callCount).to.equal(2);
        });

        it('rerolls choices after a request fails', async () => {
            const template = `<% choice %>
<% option %>
A
<% option %>
B
<% /choice %>`;
            const model = ModelMix.new().gpt51().addText(template);
            const random = sinon.stub(model, '_choiceRandom');
            random.onFirstCall().returns(0.1);
            random.onSecondCall().returns(0.9);

            nock('https://api.openai.com')
                .post('/v1/responses')
                .reply(500, { error: 'temporary failure' });
            let error;
            try {
                await model.message();
            } catch (caught) {
                error = caught;
            }
            expect(error).to.exist;
            expect(model.messages[0].content[0].text).to.equal(template);

            mockOpenAI(body => {
                expect(userTexts(body)[0].trim()).to.equal('B');
            });
            await model.message();

            expect(random.callCount).to.equal(2);
        });

        it('does not let a failed concurrent request overwrite a successful choice', async () => {
            const template = `<% choice %>
<% option %>
A
<% option %>
B
<% /choice %>`;
            const model = ModelMix.new({
                config: {
                    max_history: 10,
                    bottleneck: { maxConcurrent: 2, minTime: 0 }
                }
            }).gpt51().addText(template);
            const content = model.messages[0].content[0];
            const random = sinon.stub(model, '_choiceRandom');
            random.onFirstCall().returns(0.1);
            random.onSecondCall().returns(0.9);

            nock('https://api.openai.com')
                .post('/v1/responses')
                .delay(100)
                .reply(500, { error: 'delayed failure' });
            nock('https://api.openai.com')
                .post('/v1/responses')
                .reply(200, testUtils.createMockResponse('openai-responses', 'Success'));

            const results = await Promise.allSettled([model.message(), model.message()]);

            expect(results.map(result => result.status)).to.deep.equal(['rejected', 'fulfilled']);
            expect(content.text.trim()).to.equal('B');
            expect(model.messageTemplates.has(content)).to.equal(false);
            expect(random.callCount).to.equal(2);
        });
    });

    describe('File templates and data', () => {
        it('renders a file template with a relative include', async () => {
            const model = ModelMix.new()
                .gpt51()
                .assign({
                    name: 'Eve',
                    platform: 'ModelMix',
                    username: 'eve_user',
                    role: 'developer',
                    createdDate: '2026-08-07',
                    website: 'https://modelmix.dev',
                    company: 'AI Solutions',
                    showAccount: true
                })
                .addTextFromFile(path.join(fixturesPath, 'template.txt'));

            mockOpenAI(body => {
                const content = userTexts(body)[0];
                expect(content).to.include('Hello Eve, welcome to ModelMix!');
                expect(content).to.include('Username: eve_user');
                expect(content).to.include('Role: developer');
                expect(content).to.include('Created: 2026-08-07');
                expect(content).to.include('The AI Solutions Team');
            });

            await model.message();
        });

        it('resolves a dynamic include path relative to its template', async () => {
            const model = ModelMix.new()
                .gpt51()
                .assign({ rulesFile: 'system-rules.txt', language: 'Spanish' })
                .addTextFromFile(path.join(fixturesPath, 'dynamic-include.txt'));

            mockOpenAI(body => {
                expect(userTexts(body)[0].trim()).to.equal('Rules:\nAlways respond in Spanish.');
            });

            await model.message();
        });

        it('processes choice directives inside relative includes', async () => {
            const model = ModelMix.new()
                .gpt51()
                .addTextFromFile(path.join(fixturesPath, 'choice-template.txt'));
            sinon.stub(model, '_choiceRandom').returns(0.75);

            mockOpenAI(body => {
                expect(userTexts(body)[0].trim()).to.equal('Style:\nBe concise.');
            });

            await model.message();
        });

        it('supports recursive includes with an explicit depth limit', async () => {
            const model = ModelMix.new()
                .gpt51()
                .assign({
                    node: {
                        text: 'Root',
                        children: [{
                            text: 'Child',
                            children: [{
                                text: 'Grandchild',
                                children: [{ text: 'Too deep', children: [] }]
                            }]
                        }]
                    },
                    depth: 0,
                    maxDepth: 2
                })
                .addTextFromFile(path.join(fixturesPath, 'tree.ejs'));

            mockOpenAI(body => {
                const content = userTexts(body)[0];
                expect(content).to.include('Root');
                expect(content).to.include('Child');
                expect(content).to.include('Grandchild');
                expect(content).to.not.include('Too deep');
            });

            await model.message();
        });

        it('preserves a system template filename through new instances', async () => {
            const base = ModelMix.new()
                .setSystemFromFile(path.join(fixturesPath, 'system-template.txt'))
                .assign({ role: 'data analyst', language: 'Spanish' });
            const model = base.new().gpt51().addText('Analyze this.');

            mockOpenAI(body => {
                const system = body.input.find(message => message.role === 'developer');
                expect(system.content[0].text).to.include('You are a data analyst.');
                expect(system.content[0].text).to.include('Always respond in Spanish.');
            });

            await model.message();
        });

        it('renders assigned files through EJS includes, including their relative includes', async () => {
            const model = ModelMix.new()
                .gpt51()
                .assign({
                    name: 'Eve',
                    platform: 'ModelMix',
                    username: 'eve_user',
                    role: 'developer',
                    createdDate: '2026-08-07',
                    website: 'https://modelmix.dev',
                    company: 'AI Solutions',
                    showAccount: true
                })
                .assignKeyFromFile('templateSource', path.join(fixturesPath, 'template.txt'))
                .addText('Source:\n<%- templateSource %>');

            mockOpenAI(body => {
                const content = userTexts(body)[0];
                expect(content).to.include('Hello Eve, welcome to ModelMix!');
                expect(content).to.include('Username: eve_user');
                expect(content).to.include('The AI Solutions Team');
                expect(content).to.not.include('<%-');
            });

            await model.message();
        });

        it('inherits assigned files through new instances', async () => {
            const base = ModelMix.new()
                .assign({ language: 'Spanish' })
                .assignKeyFromFile('rules', path.join(fixturesPath, 'system-rules.txt'));
            const model = base.new().gpt51().addText('Rules:\n<%- rules %>');

            mockOpenAI(body => {
                expect(userTexts(body)[0].trim()).to.equal('Rules:\nAlways respond in Spanish.');
            });

            await model.message();
        });

        it('uses the latest assignment when a plain value and a file share a key', async () => {
            const plainValue = ModelMix.new()
                .gpt51()
                .assign({ language: 'Spanish' })
                .assignKeyFromFile('rules', path.join(fixturesPath, 'system-rules.txt'))
                .assignKey('rules', 'Use the plain value.')
                .addText('<%- rules %>');

            mockOpenAI(body => {
                expect(userTexts(body)).to.deep.equal(['Use the plain value.']);
            }, 'Plain response');
            await plainValue.message();

            const fileValue = ModelMix.new()
                .gpt51()
                .assign({ language: 'Spanish', rules: 'Ignore this value.' })
                .assignKeyFromFile('rules', path.join(fixturesPath, 'system-rules.txt'))
                .addText('<%- rules %>');

            mockOpenAI(body => {
                expect(userTexts(body)[0].trim()).to.equal('Always respond in Spanish.');
            }, 'File response');
            await fileValue.message();
        });

        it('injects JSON file contents without XML escaping', async () => {
            const model = ModelMix.new()
                .gpt51()
                .assignKeyFromFile('data', path.join(fixturesPath, 'data.json'))
                .addText('Process this data:\n<%- data %>');

            mockOpenAI(body => {
                const content = userTexts(body)[0];
                expect(content).to.include('Alice Smith');
                expect(content).to.include('alice@example.com');
                expect(content).to.include('"theme": "dark"');
            });

            await model.message();
        });

        it('reloads an assigned file for each request', async () => {
            const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'modelmix-template-'));
            const assignedFile = path.join(temporaryDirectory, 'assigned.ejs');

            try {
                fs.writeFileSync(assignedFile, 'Version one for <%- name %>.');
                const model = ModelMix.new()
                    .gpt51()
                    .assign({ name: 'Eve' })
                    .assignKeyFromFile('content', assignedFile)
                    .addText('<%- content %>');

                mockOpenAI(body => {
                    expect(userTexts(body)).to.deep.equal(['Version one for Eve.']);
                }, 'First response');
                await model.message();

                fs.writeFileSync(assignedFile, 'Version two for <%- name %>.');
                model.assign({ name: 'Ada' }).addText('<%- content %>');
                mockOpenAI(body => {
                    expect(userTexts(body)).to.deep.equal(['Version two for Ada.']);
                }, 'Second response');
                await model.message();
            } finally {
                fs.rmSync(temporaryDirectory, { recursive: true, force: true });
            }
        });

        it('throws immediately when a template or data file is missing', () => {
            const model = ModelMix.new().gpt51();
            const missingPath = path.join(fixturesPath, 'nonexistent.txt');

            expect(() => model.addTextFromFile(missingPath)).to.throw(`File not found: ${missingPath}`);
            expect(() => model.assignKeyFromFile('missing', missingPath)).to.throw(`File not found: ${missingPath}`);
            expect(() => model.assignKeyFromFile('', missingPath)).to.throw(
                TypeError,
                'Template data key must be a non-empty string.'
            );
            expect(() => model.assignKeyFromFile('$mix', missingPath)).to.throw(
                TypeError,
                'Template data key "$mix" is reserved.'
            );
        });
    });

    describe('Execution integration', () => {
        it('renders system and message templates for JSON output', async () => {
            const schema = { summary: 'Analysis summary', userCount: 0 };
            const model = ModelMix.new()
                .gpt51()
                .setSystem('You are a <%- role %>.')
                .assign({ role: 'data analyst', instruction: 'Count active users' })
                .assignKeyFromFile('data', path.join(fixturesPath, 'data.json'))
                .addText('<%- instruction %> from this data: <%- data %>');

            nock('https://api.openai.com')
                .post('/v1/responses')
                .reply(function (uri, body) {
                    const system = body.input.find(message => message.role === 'developer');
                    expect(system.content[0].text).to.include('You are a data analyst.');
                    expect(system.content[0].text).to.include('Output JSON Schema');
                    expect(userTexts(body)[0]).to.include('Count active users');
                    return [200, {
                        output: [{
                            type: 'message',
                            content: [{
                                type: 'output_text',
                                text: JSON.stringify({ summary: 'Complete', userCount: 3 })
                            }]
                        }],
                        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }
                    }];
                });

            const result = await model.json(schema);
            expect(result).to.deep.equal({ summary: 'Complete', userCount: 3 });
        });

        it('renders the system before adding block instructions', async () => {
            const model = ModelMix.new()
                .gpt51()
                .setSystem('Act as <%- role %>.')
                .assign({ role: 'reviewer' })
                .addText('Review this.');

            mockOpenAI(body => {
                const system = body.input.find(message => message.role === 'developer');
                expect(system.content[0].text).to.equal(
                    'Act as reviewer.\nReturn the result of the task between triple backtick block code tags ```'
                );
            }, '```\napproved\n```');

            expect(await model.block()).to.equal('approved');
        });

        it('keeps rendered history snapshots when template data changes', async () => {
            const model = ModelMix.new({ config: { max_history: 10 } })
                .gpt51()
                .assign({ name: 'Alice' })
                .addText('Hello <%- name %>.');

            mockOpenAI(body => {
                expect(userTexts(body)).to.deep.equal(['Hello Alice.']);
            }, 'First response');
            await model.message();

            model.assign({ name: 'Bob' }).addText('Hello <%- name %>.');
            mockOpenAI(body => {
                expect(userTexts(body)).to.deep.equal(['Hello Alice.', 'Hello Bob.']);
            }, 'Second response');
            await model.message();
        });

        it('keeps a system choice stable across provider fallback', async () => {
            const systems = [];
            const model = ModelMix.new()
                .gpt51()
                .sonnet46()
                .setSystem(`<% choice %>
<% option %>
First system.
<% option %>
Second system.
<% /choice %>`)
                .addText('Hello');
            const random = sinon.stub(model, '_choiceRandom').returns(0.9);

            nock('https://api.openai.com')
                .post('/v1/responses')
                .reply(function (uri, body) {
                    systems.push(body.input.find(message => message.role === 'developer').content[0].text.trim());
                    return [500, { error: 'temporary failure' }];
                });
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(function (uri, body) {
                    systems.push(body.system.trim());
                    return [200, {
                        content: [{ type: 'text', text: 'Fallback response' }],
                        usage: { input_tokens: 10, output_tokens: 5 }
                    }];
                });

            expect(await model.message()).to.equal('Fallback response');
            expect(systems).to.deep.equal(['Second system.', 'Second system.']);
            expect(random.callCount).to.equal(1);
        });
    });
});
