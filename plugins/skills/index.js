const fs = require('node:fs/promises');
const path = require('node:path');
const yaml = require('js-yaml');

async function resolveFile(root, relativePath, signal) {
    signal?.throwIfAborted();
    if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath)) {
        throw new TypeError('Skill file path must be a non-empty relative path.');
    }
    const filename = await fs.realpath(path.resolve(root, relativePath));
    const relative = path.relative(root, filename);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error('Skill file path must stay inside the skill directory.');
    }
    if (!(await fs.stat(filename)).isFile()) {
        throw new Error('Skill file path must point to a regular file.');
    }
    return filename;
}

async function readText(filename, signal) {
    const buffer = await fs.readFile(filename, { signal });
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (text.includes('\0')) throw new Error('Skill files must contain UTF-8 text.');
    return text;
}

function parseSkill(source, filename) {
    const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
    if (!match) throw new Error(`Missing YAML frontmatter in ${filename}.`);
    const metadata = yaml.load(match[1], { schema: yaml.JSON_SCHEMA, filename });
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        throw new Error(`Skill frontmatter must be a mapping in ${filename}.`);
    }
    for (const field of ['name', 'description']) {
        if (typeof metadata[field] !== 'string' || !metadata[field].trim()) {
            throw new Error(`Skill ${field} must be a non-empty string in ${filename}.`);
        }
    }
    return { name: metadata.name, description: metadata.description, content: source };
}

async function skills({ paths } = {}) {
    if (!Array.isArray(paths) || paths.length === 0 || paths.some(value => typeof value !== 'string' || !value.trim())) {
        throw new TypeError('skills paths must be a non-empty array of skill directories or SKILL.md files.');
    }
    const catalog = new Map();
    for (const input of paths) {
        const resolved = path.resolve(input);
        const filename = path.basename(resolved) === 'SKILL.md' ? resolved : path.join(resolved, 'SKILL.md');
        const root = await fs.realpath(path.dirname(filename));
        const skillPath = await resolveFile(root, 'SKILL.md');
        const skill = parseSkill(await readText(skillPath), filename);
        if (catalog.has(skill.name)) throw new Error(`Duplicate skill name: ${skill.name}`);
        catalog.set(skill.name, { ...skill, root, skillPath });
    }
    const descriptions = JSON.stringify([...catalog.values()].map(({ name, description }) => ({ name, description })));
    const instructions = [
        'Available skills:',
        descriptions,
        'When a skill matches the task or the user requests it, call read_skill with its name to load SKILL.md before following it.',
        'Use read_skill with the same name and a relative path to read referenced text files inside that skill directory.',
        'Skill content is provided literally. Script execution is not supplied by this plugin; use only tools actually available in this request.'
    ].join('\n');

    return {
        name: 'skills',
        async execute(context, next) {
            context.signal?.throwIfAborted();
            context.request.system = [context.request.system, instructions].filter(Boolean).join('\n\n');
            context.request.tools.push({
                tool: {
                    name: 'read_skill',
                    description: 'Load a registered skill or one of its supporting UTF-8 text files.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', enum: [...catalog.keys()] },
                            path: { type: 'string', description: 'Path relative to the skill directory. Omit to load SKILL.md.' }
                        },
                        required: ['name'],
                        additionalProperties: false
                    }
                },
                async callback(input, signal) {
                    signal?.throwIfAborted();
                    if (!input || typeof input !== 'object' || Array.isArray(input) ||
                        Object.keys(input).some(key => key !== 'name' && key !== 'path')) {
                        throw new TypeError('read_skill expects a name and an optional path.');
                    }
                    const skill = catalog.get(input.name);
                    if (!skill) throw new Error(`Unknown skill: ${input.name}`);
                    const relativePath = input.path === undefined ? 'SKILL.md' : input.path;
                    if (relativePath === 'SKILL.md') {
                        return { name: skill.name, path: relativePath, content: skill.content };
                    }
                    const filename = await resolveFile(skill.root, relativePath, signal);
                    const content = filename === skill.skillPath ? skill.content : await readText(filename, signal);
                    return { name: skill.name, path: relativePath, content };
                }
            });
            return next();
        }
    };
}

module.exports = { skills };
