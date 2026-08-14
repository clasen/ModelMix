let parserPromise;

function loadParser() {
    if (!parserPromise) {
        parserPromise = import('mdast-util-from-markdown')
            .then(module => module.fromMarkdown);
    }
    return parserPromise;
}

function nodeText(node) {
    if (typeof node.value === 'string') return node.value;
    if (!Array.isArray(node.children)) return '';
    return node.children.map(nodeText).join('');
}

function sourceSlice(source, node) {
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    if (!Number.isInteger(start) || !Number.isInteger(end)) return '';
    return source.slice(start, end);
}

function listValue(node, source) {
    return {
        ordered: node.ordered,
        start: node.ordered ? (node.start || 1) : null,
        items: node.children.map(item => {
            const nestedLists = (item.children || [])
                .filter(child => child.type === 'list')
                .map(child => listValue(child, source));
            const text = (item.children || [])
                .filter(child => child.type !== 'list')
                .map(nodeText)
                .join('\n');
            return {
                text,
                source: sourceSlice(source, item),
                lists: nestedLists
            };
        })
    };
}

function listsBetween(children, startIndex, endIndex, source) {
    return children
        .slice(startIndex, endIndex)
        .filter(node => node.type === 'list')
        .map(node => listValue(node, source));
}

function slugify(value) {
    const slug = value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'section';
}

function uniqueId(title, counts) {
    const base = slugify(title);
    const count = (counts.get(base) || 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
}

function markdownStats(source, sectionCount) {
    return {
        characters: Array.from(source).length,
        utf16CodeUnits: source.length,
        utf8Bytes: Buffer.byteLength(source, 'utf8'),
        lines: source.length === 0 ? 0 : source.split(/\r\n|\n|\r/).length,
        sectionCount
    };
}

async function parseMarkdownDocument(source) {
    if (typeof source !== 'string') {
        throw new TypeError('Markdown document content must be a string.');
    }
    const fromMarkdown = await loadParser();
    const tree = fromMarkdown(source);
    const headings = [];
    for (let index = 0; index < tree.children.length; index += 1) {
        const node = tree.children[index];
        if (node.type === 'heading') headings.push({ index, node });
    }

    const firstHeadingOffset = headings[0]?.node.position?.start?.offset ?? source.length;
    const preambleEndIndex = headings[0]?.index ?? tree.children.length;
    const document = {
        format: 'markdown',
        preamble: {
            source: source.slice(0, firstHeadingOffset),
            lists: listsBetween(tree.children, 0, preambleEndIndex, source)
        },
        sections: [],
        stats: markdownStats(source, headings.length)
    };
    const stack = [];
    const counts = new Map();

    for (let headingIndex = 0; headingIndex < headings.length; headingIndex += 1) {
        const { index, node } = headings[headingIndex];
        const next = headings[headingIndex + 1];
        const headingStart = node.position.start.offset;
        const headingEnd = node.position.end.offset;
        const bodyEnd = next?.node.position.start.offset ?? source.length;
        const bodyEndIndex = next?.index ?? tree.children.length;
        const title = nodeText(node);
        const id = uniqueId(title, counts);

        while (stack.length > 0 && stack[stack.length - 1].depth >= node.depth) {
            stack.pop();
        }
        const parent = stack[stack.length - 1] || null;
        const section = {
            id,
            path: parent ? [...parent.path, id] : [id],
            title,
            depth: node.depth,
            order: headingIndex,
            heading: source.slice(headingStart, headingEnd),
            body: source.slice(headingEnd, bodyEnd),
            lists: listsBetween(tree.children, index + 1, bodyEndIndex, source),
            children: []
        };
        if (parent) parent.children.push(section);
        else document.sections.push(section);
        stack.push(section);
    }

    return document;
}

function renderSections(sections) {
    return sections.map(section => (
        section.heading
        + section.body
        + renderSections(section.children)
    )).join('');
}

function reconstructMarkdownDocument(document) {
    if (!document || document.format !== 'markdown' || !Array.isArray(document.sections)) {
        throw new TypeError('document must be a parsed Markdown document.');
    }
    return `${document.preamble?.source || ''}${renderSections(document.sections)}`;
}

module.exports = {
    parseMarkdownDocument,
    reconstructMarkdownDocument
};
