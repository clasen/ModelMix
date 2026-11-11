import { isPlainObject } from './object-utils';

export interface TemplateLocation {
    filename?: string | null;
    label?: string;
}

interface ChoiceBlock {
    lineNumber: number;
    optionCount: number;
    weighted: boolean | null;
}

type RenderOption = () => unknown;

interface DefineOption {
    (render: RenderOption): void;
    (weight: number, render: RenderOption): void;
}

export interface TemplateHelpers {
    choice(defineOptions: (option: DefineOption) => void): unknown;
}

export interface RenderedMessage {
    rendered: string;
    template: object;
}

export interface TemplateRenderContext {
    helpers: Readonly<TemplateHelpers>;
    renderedTemplateData: Map<object, string>;
    renderedMessages: Map<{ text?: unknown }, RenderedMessage>;
    renderedSystems: Map<string, string>;
}

export function validateTemplateData(value: unknown): void {
    if (!isPlainObject(value)) {
        throw new TypeError('Template data must be a plain non-null object.');
    }
    if (Object.prototype.hasOwnProperty.call(value, '$mix')) {
        throw new TypeError('Template data key "$mix" is reserved.');
    }
}

export function validateTemplateDataKey(key: unknown): asserts key is string {
    if (typeof key !== 'string' || key.length === 0) {
        throw new TypeError('Template data key must be a non-empty string.');
    }
    if (key === '$mix') {
        throw new TypeError('Template data key "$mix" is reserved.');
    }
}

function templateLocation({ filename, label }: TemplateLocation, lineNumber: number): string {
    return `${filename || label} at line ${lineNumber}`;
}

export function preprocessChoiceDirectives(source: string, { filename = null, label = 'template' }: TemplateLocation = {}): string {
    const parts = source.split(/(\r\n|\n|\r)/);
    const blocks: ChoiceBlock[] = [];

    for (let index = 0; index < parts.length; index += 2) {
        const line = parts[index];
        const trimmed = line.trim();
        const lineNumber = (index / 2) + 1;
        const location = templateLocation({ filename, label }, lineNumber);
        const newline = parts[index + 1] || '';

        if (/^<%\s*choice\s*%>$/.test(trimmed)) {
            const parent = blocks[blocks.length - 1];
            if (parent && parent.optionCount === 0) {
                throw new Error(`A nested choice must be inside an option (${location}).`);
            }
            blocks.push({ lineNumber, optionCount: 0, weighted: null });
            parts[index] = '<% $mix.choice(option => { -%>';
            continue;
        }

        const optionMatch = trimmed.match(/^<%\s*option(?:\s+(.+?))?\s*%>$/);
        if (optionMatch) {
            const block = blocks[blocks.length - 1];
            if (!block) {
                throw new Error(`Option directive must be inside a choice (${location}).`);
            }

            const weightText = optionMatch[1];
            const weighted = weightText !== undefined;
            if (block.weighted !== null && block.weighted !== weighted) {
                throw new Error(`Choice options must either all have weights or all omit them (${location}).`);
            }

            let argument = '';
            if (weighted) {
                const weight = Number(weightText);
                if (!Number.isFinite(weight) || weight <= 0) {
                    throw new Error(`Choice weight must be a positive finite number (${location}).`);
                }
                argument = `${weight}, `;
            }

            block.weighted = weighted;
            parts[index] = `<% ${block.optionCount > 0 ? '}); ' : ''}option(${argument}() => { -%>`;
            block.optionCount += 1;
            continue;
        }

        if (/^<%\s*\/choice\s*%>$/.test(trimmed)) {
            const block = blocks.pop();
            if (!block) {
                throw new Error(`Closing choice directive has no matching opening directive (${location}).`);
            }
            if (block.optionCount === 0) {
                throw new Error(`Choice must contain at least one option (${location}).`);
            }
            parts[index] = '<% }); }); -%>';
            continue;
        }

        if (/^<%\s*(?:choice|option|\/choice)(?:\s|%>)/.test(trimmed)) {
            throw new Error(`Invalid choice directive (${location}).`);
        }

        const block = blocks[blocks.length - 1];
        if (block && block.optionCount === 0) {
            if (trimmed) {
                throw new Error(`Choice content must be inside an option (${location}).`);
            }
            parts[index] = '<%# -%>';
        }

        if (newline) parts[index + 1] = newline;
    }

    if (blocks.length > 0) {
        const block = blocks[blocks.length - 1];
        throw new Error(`Unclosed choice directive (${templateLocation({ filename, label }, block.lineNumber)}).`);
    }

    return parts.join('');
}

export function createTemplateRenderContext(random: () => number = Math.random): TemplateRenderContext {
    const choice = (defineOptions: (option: DefineOption) => void): unknown => {
        if (typeof defineOptions !== 'function') {
            throw new TypeError('$mix.choice expects an option definition callback.');
        }

        const options: Array<{ weight: number; render: RenderOption }> = [];
        let weighted: boolean | null = null;
        const option = ((weightOrRender: number | RenderOption, renderOption?: RenderOption) => {
            const hasWeight = renderOption !== undefined;
            const weight = hasWeight ? weightOrRender as number : 1;
            const render = hasWeight ? renderOption : weightOrRender;

            if (weighted !== null && weighted !== hasWeight) {
                throw new TypeError('$mix.choice options cannot mix weighted and unweighted forms.');
            }
            if (!Number.isFinite(weight) || weight <= 0) {
                throw new TypeError('$mix.choice weights must be positive finite numbers.');
            }
            if (typeof render !== 'function') {
                throw new TypeError('$mix.choice options require a render callback.');
            }

            weighted = hasWeight;
            options.push({ weight, render });
        }) as DefineOption;

        defineOptions(option);
        if (options.length === 0) {
            throw new Error('$mix.choice requires at least one option.');
        }

        const totalWeight = options.reduce((sum, current) => sum + current.weight, 0);
        if (!Number.isFinite(totalWeight)) {
            throw new TypeError('$mix.choice total weight must be finite.');
        }

        let target = random() * totalWeight;
        for (const current of options) {
            target -= current.weight;
            if (target < 0) return current.render();
        }
        return options[options.length - 1].render();
    };

    return {
        helpers: Object.freeze({ choice }),
        renderedTemplateData: new Map(),
        renderedMessages: new Map(),
        renderedSystems: new Map()
    };
}
