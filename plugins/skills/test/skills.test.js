const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ModelMix, MixCustom } = require('../../..');
const { skills } = require('..');

describe('Skills plugin', () => {
    let temporary;
    let directory;
    const source = '---\nname: writing\ndescription: >-\n  Write clear prose\n  for readers.\nmetadata:\n  category: editorial\n---\nUse references/style.md. Preserve <%= literal %> and ${text}.\n';

    beforeEach(async () => {
        temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'modelmix-skills-'));
        directory = path.join(temporary, 'writing');
        await fs.mkdir(path.join(directory, 'references'), { recursive: true });
        await fs.writeFile(path.join(directory, 'SKILL.md'), source);
        await fs.writeFile(path.join(directory, 'references/style.md'), 'Use concrete verbs.');
    });

    afterEach(async () => {
        await fs.rm(temporary, { recursive: true, force: true });
    });

    async function prepare(plugin) {
        const request = { system: 'Existing system', tools: [] };
        await plugin.execute({ request }, async () => ({ message: 'ok' }));
        return request;
    }

    it('loads only metadata into the prompt and exposes literal skill content on demand', async () => {
        const plugin = await skills({ paths: [directory] });
        const request = await prepare(plugin);
        assert.ok(request.system.startsWith('Existing system\n\n'));
        assert.ok(request.system.includes('Write clear prose for readers.'));
        assert.ok(!request.system.includes('Preserve <%= literal %>'));
        const result = await request.tools[0].callback({ name: 'writing' });
        assert.deepEqual(result, { name: 'writing', path: 'SKILL.md', content: source });
    });

    it('supports SKILL.md paths and reads references relative to the skill root', async () => {
        const request = await prepare(await skills({ paths: [path.join(directory, 'SKILL.md')] }));
        assert.deepEqual(await request.tools[0].callback({ name: 'writing', path: 'references/style.md' }), {
            name: 'writing', path: 'references/style.md', content: 'Use concrete verbs.'
        });
    });

    it('returns the loaded snapshot for every path that resolves to SKILL.md', async () => {
        await fs.symlink(path.join(directory, 'SKILL.md'), path.join(directory, 'alias.md'));
        const request = await prepare(await skills({ paths: [directory] }));
        await fs.writeFile(path.join(directory, 'SKILL.md'), '---\nname: writing\ndescription: Changed\n---\nChanged body.\n');
        for (const relative of ['./SKILL.md', 'references/../SKILL.md', 'alias.md']) {
            assert.deepEqual(await request.tools[0].callback({ name: 'writing', path: relative }), {
                name: 'writing', path: relative, content: source
            });
        }
    });

    it('reads supporting files from disk on every call', async () => {
        const request = await prepare(await skills({ paths: [directory] }));
        await fs.writeFile(path.join(directory, 'references/style.md'), 'Use strong verbs.');
        assert.deepEqual(await request.tools[0].callback({ name: 'writing', path: 'references/style.md' }), {
            name: 'writing', path: 'references/style.md', content: 'Use strong verbs.'
        });
    });

    it('returns the snapshot for SKILL.md aliases without decoding the changed file', async () => {
        await fs.symlink(path.join(directory, 'SKILL.md'), path.join(directory, 'alias.md'));
        const request = await prepare(await skills({ paths: [directory] }));
        await fs.writeFile(path.join(directory, 'SKILL.md'), Buffer.from([0, 255, 128]));
        for (const relative of ['./SKILL.md', 'alias.md']) {
            assert.deepEqual(await request.tools[0].callback({ name: 'writing', path: relative }), {
                name: 'writing', path: relative, content: source
            });
        }
    });

    it('runs the complete tool loop without re-rendering skill text or changing instance configuration', async () => {
        const requests = [];
        const provider = new MixCustom();
        provider.create = async request => {
            requests.push(request);
            if (requests.length === 1) return {
                message: '', toolCalls: [{ id: 'skill', name: 'read_skill', input: { name: 'writing' } }]
            };
            if (requests.length === 2) return {
                message: '', toolCalls: [{ id: 'reference', name: 'read_skill', input: { name: 'writing', path: 'references/style.md' } }]
            };
            return { message: '{"answer":"Concrete verbs"}', toolCalls: [] };
        };
        const model = ModelMix.new({ config: { system: 'Be concise.' } })
            .attach('custom', provider).use(await skills({ paths: [directory] })).addText('Use writing.');
        assert.deepEqual(await model.json(), { answer: 'Concrete verbs' });
        assert.equal(requests.length, 3);
        for (const request of requests) {
            assert.equal(request.config.system.split('Available skills:').length, 2);
            assert.equal(request.options.tools[0].function.name, 'read_skill');
        }
        const outputs = requests[2].options.messages.filter(message => message.role === 'tool').map(message => JSON.parse(message.content));
        assert.equal(outputs[0].content, source);
        assert.equal(outputs[1].content, 'Use concrete verbs.');
        assert.equal(model.config.max_history, 0);
        assert.equal(model.config.system, 'Be concise.');
        assert.deepEqual(model.tools, {});
        assert.deepEqual(model.messages, []);
    });

    it('supports inherited plugins without leaking tools into sibling or later requests', async () => {
        const provider = new MixCustom();
        const requests = [];
        provider.create = async request => {
            requests.push(request);
            return { message: 'ok', toolCalls: [] };
        };
        const model = ModelMix.new().attach('custom', provider).use(await skills({ paths: [directory] }));
        await model.new().addText('child').message();
        await model.addText('first').message();
        await model.addText('second').message();
        await ModelMix.new().attach('custom', provider).addText('sibling').message();
        for (const request of requests.slice(0, 3)) assert.equal(request.options.tools.length, 1);
        assert.equal(requests[3].options.tools, undefined);
    });

    it('rejects missing files, missing metadata, malformed YAML, and duplicate names', async () => {
        await assert.rejects(skills({ paths: [path.join(temporary, 'missing')] }), /ENOENT/);
        for (const content of ['No frontmatter', '---\nname: writing\n---\nBody', '---\nname: [broken\n---\nBody', '---\nname: writing\nname: duplicate\ndescription: text\n---\nBody']) {
            await fs.writeFile(path.join(directory, 'SKILL.md'), content);
            await assert.rejects(skills({ paths: [directory] }));
        }
        await fs.writeFile(path.join(directory, 'SKILL.md'), source);
        await assert.rejects(skills({ paths: [directory, directory] }), /Duplicate skill name/);
    });

    it('validates configuration and tool arguments', async () => {
        for (const options of [undefined, {}, { paths: [] }, { paths: [''] }, { paths: 'directory' }]) {
            await assert.rejects(skills(options), /paths must be/);
        }
        const request = await prepare(await skills({ paths: [directory] }));
        const read = request.tools[0].callback;
        await assert.rejects(read({ name: 'missing' }), /Unknown skill/);
        await assert.rejects(read({ name: 'writing', extra: true }), /expects a name/);
        for (const value of ['', null, 42, directory]) {
            await assert.rejects(read({ name: 'writing', path: value }), /relative path/);
        }
    });

    it('blocks traversal, prefix siblings, and symlinks outside the skill directory', async () => {
        await fs.writeFile(path.join(temporary, 'outside.md'), 'outside');
        const sibling = path.join(temporary, 'writing-other');
        await fs.mkdir(sibling);
        await fs.writeFile(path.join(sibling, 'file.md'), 'sibling');
        await fs.symlink(path.join(temporary, 'outside.md'), path.join(directory, 'linked.md'));
        const request = await prepare(await skills({ paths: [directory] }));
        for (const relative of ['../outside.md', '../writing-other/file.md', 'linked.md']) {
            await assert.rejects(request.tools[0].callback({ name: 'writing', path: relative }), /inside the skill directory/);
        }
    });

    it('blocks SKILL.md symlinks outside the registered directory', async () => {
        await fs.writeFile(path.join(temporary, 'outside.md'), source);
        await fs.unlink(path.join(directory, 'SKILL.md'));
        await fs.symlink(path.join(temporary, 'outside.md'), path.join(directory, 'SKILL.md'));
        await assert.rejects(skills({ paths: [directory] }), /inside the skill directory/);
    });

    it('rejects directories and binary resources', async () => {
        await fs.writeFile(path.join(directory, 'binary'), Buffer.from([0, 255, 128]));
        const request = await prepare(await skills({ paths: [directory] }));
        await assert.rejects(request.tools[0].callback({ name: 'writing', path: 'references' }), /regular file/);
        await assert.rejects(request.tools[0].callback({ name: 'writing', path: 'binary' }));
    });

    it('propagates cancellation before middleware and resource reads', async () => {
        const plugin = await skills({ paths: [directory] });
        const request = await prepare(plugin);
        const controller = new AbortController();
        const reason = new Error('cancelled');
        controller.abort(reason);
        await assert.rejects(plugin.execute({ request, signal: controller.signal }, () => assert.fail('next called')), error => error === reason);
        await assert.rejects(request.tools[0].callback({ name: 'writing', path: 'references/style.md' }, controller.signal), error => error === reason);
    });
});
