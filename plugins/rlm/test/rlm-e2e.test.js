const { expect } = require('chai');
const { MixCustom, ModelMix } = require('../../../index.js');
const { rlm } = require('..');

function createProvider(handler) {
    const provider = new MixCustom();
    provider.create = handler;
    return provider;
}

function limits(overrides = {}) {
    return {
        maxQueryBytes: 2048,
        sandboxMemoryBytes: 64 * 1024 * 1024,
        maxConcurrentQueries: 2,
        maxCalls: 30,
        maxOutputBytes: 1024 * 1024,
        maxGeneratedTokens: 10000,
        maxWallTimeMs: 30000,
        ...overrides
    };
}

function worker(model, description) {
    return {
        model,
        intelligence: 3,
        cost: 2,
        speed: 4,
        description
    };
}

describe('RLM mocked end-to-end execution', () => {
    it('translates a book by chapter, recursively splits paragraphs, and preserves order', async () => {
        const book = {
            chapters: [
                {
                    heading: 'Secret chapter one',
                    content: 'one slow\n\ntwo fast'
                },
                {
                    heading: 'Secret chapter two',
                    content: 'three fast\n\nfour slow'
                }
            ]
        };
        const plannerRequests = [];
        const leafRequests = [];
        let activeLeafCalls = 0;
        let peakLeafCalls = 0;
        const plannerProvider = createProvider(async request => {
            plannerRequests.push(request);
            return {
                message: '(async () => "root plan")()',
                toolCalls: [],
                tokens: { input: 10, output: 2, total: 12, cost: 0.001 }
            };
        });
        const workerProvider = createProvider(async request => {
            if (request.config.system.includes('# Recursive Language Model Planner')) {
                plannerRequests.push(request);
                return {
                    message: '(async () => "chapter plan")()',
                    toolCalls: [],
                    tokens: { input: 8, output: 2, total: 10, cost: 0.0005 }
                };
            }
            leafRequests.push(request);
            activeLeafCalls += 1;
            peakLeafCalls = Math.max(peakLeafCalls, activeLeafCalls);
            const paragraph = request.options.messages[0].content;
            await new Promise(resolve => setTimeout(
                resolve,
                paragraph.includes('slow') ? 20 : 2
            ));
            activeLeafCalls -= 1;
            return {
                message: `ES:${paragraph}`,
                toolCalls: [],
                tokens: { input: 3, output: 2, total: 5, cost: 0.0001 }
            };
        });
        const translator = ModelMix.new().attach('translator', workerProvider);
        const sandbox = {
            async execute({ variables, query }) {
                if (variables.chapters) {
                    const chapters = await Promise.all(variables.chapters.map(chapter => query({
                        worker: 'translator',
                        system: 'Translate this chapter to Spanish, preserving paragraph order.',
                        message: chapter.content
                    })));
                    return chapters.join('\n\n# CHAPTER\n\n');
                }
                const paragraphs = variables.input.split(/\n\n+/);
                const translated = await Promise.all(paragraphs.map(paragraph => query({
                    worker: 'translator',
                    system: 'Translate this paragraph to Spanish.',
                    message: paragraph
                })));
                return translated.join('\n\n');
            }
        };
        const model = ModelMix.new()
            .attach('planner', plannerProvider)
            .use(rlm({
                maxDepth: 1,
                variables: book,
                workers: {
                    translator: worker(translator, 'Translation and rewriting')
                },
                limits: limits(),
                sandbox
            }))
            .addText('Translate this book to neutral Latin American Spanish.');

        const result = await model.raw();

        expect(result.message).to.equal([
            'ES:one slow',
            'ES:two fast',
            '# CHAPTER',
            'ES:three fast',
            'ES:four slow'
        ].join('\n\n'));
        expect(plannerRequests).to.have.length(3);
        expect(leafRequests).to.have.length(4);
        expect(peakLeafCalls).to.equal(2);
        for (const request of plannerRequests) {
            expect(request.options.messages).to.have.length(1);
            expect(request.config.system).to.include('# Recursive Language Model Planner');
            for (const chapter of book.chapters) {
                expect(request.config.system).to.not.include(chapter.heading);
                expect(request.config.system).to.not.include(chapter.content);
            }
        }
        for (const request of leafRequests) {
            expect(request.options.messages).to.have.length(1);
        }
        expect(result.rlm.terminationReason).to.equal('completed');
        expect(result.rlm.budget).to.include({
            calls: 7,
            peakConcurrency: 2
        });
        expect(result.rlm.calls.filter(call => call.kind === 'planner')).to.have.length(3);
        expect(result.rlm.calls.filter(call => call.kind === 'worker' && call.directLeaf))
            .to.have.length(4);
        expect(result.tokens).to.deep.include({
            input: 38,
            output: 14,
            total: 52
        });
    });

    it('supports a non-translation operation and reports invalid worker choices', async () => {
        const records = [
            'Ada works in Engineering.',
            'Lin works in Design.'
        ];
        const classificationPlannerSystems = [];
        const planner = createProvider(async request => {
            classificationPlannerSystems.push(request.config.system);
            return {
                message: '(async () => "classification plan")()',
                toolCalls: []
            };
        });
        const classifier = ModelMix.new().attach('classifier', createProvider(async request => ({
            message: request.options.messages[0].content.includes('Engineering') ? 'engineering' : 'other',
            toolCalls: []
        })));
        const sandbox = {
            async execute({ variables, query }) {
                const departments = await Promise.all(variables.records.map(message => query({
                    worker: 'classifier',
                    system: 'Classify the department.',
                    message
                })));
                return { departments };
            }
        };
        const model = ModelMix.new()
            .attach('planner', planner)
            .use(rlm({
                maxDepth: 0,
                variables: { records },
                workers: {
                    classifier: worker(classifier, 'Simple classification')
                },
                limits: limits(),
                sandbox
            }))
            .addText('Classify every external record.');

        expect(await model.json({ departments: [''] })).to.deep.equal({
            departments: ['engineering', 'other']
        });
        expect(classificationPlannerSystems[0]).to.include('"mode": "json"');
        expect(classificationPlannerSystems[0]).to.include('"departments"');

        const invalidModel = ModelMix.new()
            .attach('planner', planner)
            .use(rlm({
                maxDepth: 0,
                variables: { records },
                workers: {
                    classifier: worker(classifier, 'Simple classification')
                },
                limits: limits(),
                sandbox: {
                    execute({ query }) {
                        return query({
                            worker: 'missing',
                            system: 'Classify.',
                            message: records[0]
                        });
                    }
                }
            }))
            .addText('Classify records.');
        let failure;
        try {
            await invalidModel.raw();
        } catch (error) {
            failure = error;
        }
        expect(failure).to.be.instanceOf(Error);
        expect(failure.message).to.include('Unknown RLM worker "missing"');
    });

    it('translates a Markdown book through semantic chapters and paragraphs in isolated-vm', async () => {
        const markdown = [
            '# First chapter',
            '',
            'one slow',
            '',
            'two fast',
            '',
            '# Second chapter',
            '',
            'three fast',
            '',
            'four slow',
            ''
        ].join('\n');
        const plannerRequests = [];
        const leafRequests = [];
        let activeLeafCalls = 0;
        let peakLeafCalls = 0;
        const rootProgram = `(async () => {
            const translations = await Promise.all(variables.book.sections.map(chapter => query({
                worker: 'translator',
                system: 'Translate this chapter to Spanish, preserving paragraph order.',
                message: chapter.body.trim()
            })));
            return translations.map((translation, index) => (
                variables.book.sections[index].heading + '\\n\\n' + translation
            )).join('\\n\\n');
        })()`;
        const chapterProgram = `(async () => {
            const paragraphs = variables.input.split(/\\n\\n+/);
            const translations = await Promise.all(paragraphs.map(paragraph => query({
                worker: 'translator',
                system: 'Translate this paragraph to Spanish.',
                message: paragraph
            })));
            return translations.join('\\n\\n');
        })()`;
        const plannerProvider = createProvider(async request => {
            plannerRequests.push(request);
            return {
                message: rootProgram,
                toolCalls: []
            };
        });
        const translator = ModelMix.new().attach('translator', createProvider(async request => {
            if (request.config.system.includes('# Recursive Language Model Planner')) {
                plannerRequests.push(request);
                return {
                    message: chapterProgram,
                    toolCalls: []
                };
            }
            leafRequests.push(request);
            activeLeafCalls += 1;
            peakLeafCalls = Math.max(peakLeafCalls, activeLeafCalls);
            const paragraph = request.options.messages[0].content;
            await new Promise(resolve => setTimeout(
                resolve,
                paragraph.includes('slow') ? 20 : 2
            ));
            activeLeafCalls -= 1;
            return {
                message: `ES:${paragraph}`,
                toolCalls: []
            };
        }));
        const model = ModelMix.new()
            .attach('planner', plannerProvider)
            .use(rlm({
                maxDepth: 1,
                documents: {
                    book: { format: 'markdown', content: markdown }
                },
                workers: {
                    translator: worker(translator, 'Translation and rewriting')
                },
                limits: limits()
            }))
            .addText('Translate this book to neutral Latin American Spanish.');

        const result = await model.raw();

        expect(result.message).to.equal([
            '# First chapter',
            '',
            'ES:one slow',
            '',
            'ES:two fast',
            '',
            '# Second chapter',
            '',
            'ES:three fast',
            '',
            'ES:four slow'
        ].join('\n'));
        expect(plannerRequests).to.have.length(3);
        expect(leafRequests).to.have.length(4);
        expect(peakLeafCalls).to.equal(2);
        for (const request of plannerRequests) {
            expect(request.config.system).to.not.include('one slow');
            expect(request.config.system).to.not.include('four slow');
            expect(request.config.system).to.include('"utf8Bytes"');
        }
        expect(plannerRequests[0].config.system).to.include('"path": "book.sections"');
        expect(plannerRequests[0].config.system).to.include('"items": 2');
    });
});
