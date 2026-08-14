const fs = require('fs');
const path = require('path');
const { expect } = require('chai');
const {
    parseMarkdownDocument,
    reconstructMarkdownDocument
} = require('..');

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/book.md');

describe('RLM Markdown document mapping', () => {
    it('creates a stable semantic tree and preserves exact source order', async () => {
        const source = fs.readFileSync(FIXTURE_PATH, 'utf8');
        const document = await parseMarkdownDocument(source);

        expect(document.format).to.equal('markdown');
        expect(document.stats).to.include({
            utf8Bytes: Buffer.byteLength(source, 'utf8'),
            sectionCount: 3
        });
        expect(document.preamble.source).to.include('Introductory note');
        expect(document.preamble.lists[0].items.map(item => item.text)).to.deep.equal([
            'Preface item one',
            'Preface item two'
        ]);
        expect(document.sections).to.have.length(2);
        expect(document.sections[0]).to.include({
            id: 'chapter-one',
            title: 'Chapter One',
            depth: 1,
            order: 0
        });
        expect(document.sections[0].path).to.deep.equal(['chapter-one']);
        expect(document.sections[0].children[0]).to.include({
            id: 'scene-one',
            title: 'Scene One',
            depth: 2,
            order: 1
        });
        expect(document.sections[0].children[0].path).to.deep.equal([
            'chapter-one',
            'scene-one'
        ]);
        expect(document.sections[1].id).to.equal('chapter-one-2');
        expect(document.sections[0].body).to.include('Opening paragraph.');
        expect(document.sections[0].lists[0].items[1].lists[0].items[0].text)
            .to.equal('Nested point');
        expect(document.sections[0].children[0].body)
            .to.include('# This is code, not a chapter');
        expect(document.sections[1].body).to.include('| Character | Role |');
        expect(reconstructMarkdownDocument(document)).to.equal(source);
    });

    it('maps heading-free Markdown to introductory content', async () => {
        const source = 'Paragraph one.\n\n1. Alpha\n2. Beta\n';
        const document = await parseMarkdownDocument(source);

        expect(document.sections).to.deep.equal([]);
        expect(document.preamble.source).to.equal(source);
        expect(document.preamble.lists[0].items.map(item => item.text))
            .to.deep.equal(['Alpha', 'Beta']);
        expect(reconstructMarkdownDocument(document)).to.equal(source);
    });
});
