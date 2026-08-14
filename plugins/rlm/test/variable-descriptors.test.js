const { expect } = require('chai');
const { describeVariables, plannerTemplateData } = require('..');

describe('RLM variable metadata', () => {
    const workerManifest = {
        fast: {
            intelligence: 1,
            cost: 1,
            speed: 5,
            description: 'Fast transformations'
        }
    };
    const runtimeLimits = {
        maxCalls: 20,
        maxOutputBytes: 1024 * 1024,
        maxGeneratedTokens: 10000,
        maxWallTimeMs: 30000
    };
    const book = {
        title: 'A hidden title that must not reach the planner',
        chapters: [
            {
                heading: 'First hidden chapter',
                content: 'First secret paragraph.\n\nSecond secret paragraph.',
                tags: ['opening', 'setup']
            },
            {
                heading: 'Second hidden chapter',
                content: 'Árbol and emoji 😀.\n\nAnother concealed paragraph.',
                tags: ['middle']
            }
        ]
    };

    it('describes strings, objects, and arrays without exposing their content', () => {
        const manifest = describeVariables(book);
        const title = manifest.descriptors.title;
        const chapters = manifest.descriptors.chapters;

        expect(manifest).to.include({
            sizeBasis: 'serialized-json-utf8',
            variables: 2,
            estimatedBytes: Buffer.byteLength(JSON.stringify(book), 'utf8')
        });
        expect(title).to.include({
            path: 'title',
            type: 'string',
            characters: Array.from(book.title).length,
            utf16CodeUnits: book.title.length,
            utf8Bytes: Buffer.byteLength(book.title, 'utf8'),
            lines: 1,
            paragraphs: 1
        });
        expect(chapters).to.include({
            path: 'chapters',
            type: 'array',
            items: 2,
            estimatedBytes: Buffer.byteLength(JSON.stringify(book.chapters), 'utf8')
        });
        expect(chapters.itemSize).to.deep.equal({
            min: Math.min(...book.chapters.map(chapter => Buffer.byteLength(JSON.stringify(chapter), 'utf8'))),
            max: Math.max(...book.chapters.map(chapter => Buffer.byteLength(JSON.stringify(chapter), 'utf8'))),
            average: Number((book.chapters
                .map(chapter => Buffer.byteLength(JSON.stringify(chapter), 'utf8'))
                .reduce((sum, bytes) => sum + bytes, 0) / 2).toFixed(2)),
            total: book.chapters
                .map(chapter => Buffer.byteLength(JSON.stringify(chapter), 'utf8'))
                .reduce((sum, bytes) => sum + bytes, 0)
        });
        expect(chapters.itemShape.types).to.deep.equal({ object: 2 });
        expect(chapters.itemShape.properties.content).to.deep.include({
            present: 2,
            missing: 0,
            types: { string: 2 }
        });
        expect(chapters.itemShape.properties.content.stringSize.paragraphs).to.deep.equal({
            min: 2,
            max: 2,
            average: 2,
            total: 4
        });

        const serializedManifest = JSON.stringify(manifest);
        expect(serializedManifest).to.not.include(book.title);
        for (const chapter of book.chapters) {
            expect(serializedManifest).to.not.include(chapter.heading);
            expect(serializedManifest).to.not.include(chapter.content);
            for (const tag of chapter.tags) expect(serializedManifest).to.not.include(tag);
        }
    });

    it('keeps exact aggregate sizes for large arrays without listing their items', () => {
        const values = Array.from({ length: 100000 }, (_, index) => `row-${index}`);
        const descriptor = describeVariables({ values }).descriptors.values;

        expect(descriptor.items).to.equal(values.length);
        expect(descriptor.estimatedBytes).to.equal(Buffer.byteLength(JSON.stringify(values), 'utf8'));
        expect(descriptor).to.not.have.property('children');
        expect(JSON.stringify(descriptor)).to.not.include('row-99999');
    });

    it('rejects values that cannot safely enter the sandbox environment', () => {
        const circular = {};
        circular.self = circular;

        expect(() => describeVariables({ circular })).to.throw('circular reference');
        expect(() => describeVariables({ callback() {} })).to.throw('unsupported type function');
        expect(() => describeVariables({ invalid: Infinity })).to.throw('finite numbers');
        expect(() => describeVariables({ date: new Date() })).to.throw('plain objects');
    });

    it('adds limits and actionable partition guidance to the planner prompt', () => {
        const templateData = plannerTemplateData({
            variables: book,
            limits: {
                ...runtimeLimits,
                maxQueryBytes: 32,
                sandboxMemoryBytes: 64 * 1024 * 1024,
                maxConcurrentQueries: 4
            },
            workerManifest
        });

        expect(templateData.variableManifest).to.include('"items": 2');
        expect(templateData.processingLimits).to.include('"maxQueryBytes": 32');
        expect(templateData.processingLimits).to.include('"sandboxMemoryBytes": 67108864');
        expect(templateData.processingLimits).to.include('"maxConcurrentQueries": 4');
        expect(templateData.planningHints).to.include('"strategy": "split-oversized-items-semantically"');
        expect(templateData.planningHints).to.include('"oversizedStringFields"');
        expect(templateData.planningHints).to.include('"content"');
        const serializedTemplateData = JSON.stringify(templateData);
        expect(serializedTemplateData).to.not.include(book.title);
        for (const chapter of book.chapters) {
            expect(serializedTemplateData).to.not.include(chapter.heading);
            expect(serializedTemplateData).to.not.include(chapter.content);
        }
    });

    it('distinguishes direct values from arrays that should be batched', () => {
        const templateData = plannerTemplateData({
            variables: {
                instruction: 'short',
                paragraphs: Array.from({ length: 20 }, () => 'small paragraph')
            },
            limits: {
                ...runtimeLimits,
                maxQueryBytes: 80,
                sandboxMemoryBytes: 1024 * 1024,
                maxConcurrentQueries: 2
            },
            workerManifest
        });

        expect(templateData.planningHints).to.include('"path": "instruction"');
        expect(templateData.planningHints).to.include('"strategy": "direct"');
        expect(templateData.planningHints).to.include('"path": "paragraphs"');
        expect(templateData.planningHints).to.include('"strategy": "batch-array-items"');
        expect(templateData.planningHints).to.match(/"suggestedMaxItemsPerQuery": [1-9]\d*/);
    });

    it('requires explicit planning limits instead of silent defaults', () => {
        expect(() => plannerTemplateData({ variables: {}, limits: {}, workerManifest }))
            .to.throw('limits.maxQueryBytes');
        expect(() => plannerTemplateData({
            variables: {},
            limits: { maxQueryBytes: 100, sandboxMemoryBytes: 1000 },
            workerManifest
        })).to.throw('limits.maxConcurrentQueries');
    });
});
