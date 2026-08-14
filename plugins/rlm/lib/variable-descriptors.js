function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function roundAverage(total, count) {
    return count === 0 ? 0 : Number((total / count).toFixed(2));
}

function numericStats(values) {
    if (values.length === 0) {
        return { min: 0, max: 0, average: 0, total: 0 };
    }
    let min = values[0];
    let max = values[0];
    let total = 0;
    for (const value of values) {
        min = Math.min(min, value);
        max = Math.max(max, value);
        total += value;
    }
    return {
        min,
        max,
        average: roundAverage(total, values.length),
        total
    };
}

function valueType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

function primitiveSerializedBytes(value, path) {
    let serialized;
    try {
        serialized = JSON.stringify(value);
    } catch (error) {
        throw new TypeError(`External variable ${path} is not JSON-serializable: ${error.message}`);
    }
    if (serialized === undefined) {
        throw new TypeError(`External variable ${path} is not JSON-serializable.`);
    }
    return Buffer.byteLength(serialized, 'utf8');
}

function objectSerializedBytes(value, childDescriptors) {
    const keys = Object.keys(value);
    let bytes = 2;
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        bytes += primitiveSerializedBytes(key, key) + 1 + childDescriptors[key].estimatedBytes;
        if (index > 0) bytes += 1;
    }
    return bytes;
}

function arraySerializedBytes(itemBytes) {
    if (itemBytes.length === 0) return 2;
    return 2
        + itemBytes.reduce((sum, bytes) => sum + bytes, 0)
        + itemBytes.length - 1;
}

function countLines(value) {
    return value.length === 0 ? 0 : value.split(/\r\n|\n|\r/).length;
}

function countParagraphs(value) {
    const trimmed = value.trim();
    return trimmed.length === 0
        ? 0
        : trimmed.split(/(?:\r\n|\n|\r)[\t ]*(?:\r\n|\n|\r)+/).length;
}

function stringMetrics(value) {
    return {
        characters: Array.from(value).length,
        utf16CodeUnits: value.length,
        utf8Bytes: Buffer.byteLength(value, 'utf8'),
        lines: countLines(value),
        paragraphs: countParagraphs(value)
    };
}

function incrementType(types, value) {
    const type = valueType(value);
    types[type] = (types[type] || 0) + 1;
}

function summarizeStringValues(values) {
    const metrics = values.map(stringMetrics);
    return {
        characters: numericStats(metrics.map(metric => metric.characters)),
        utf8Bytes: numericStats(metrics.map(metric => metric.utf8Bytes)),
        lines: numericStats(metrics.map(metric => metric.lines)),
        paragraphs: numericStats(metrics.map(metric => metric.paragraphs))
    };
}

function summarizeObjectArray(items) {
    const keys = [...new Set(items.flatMap(item => Object.keys(item)))].sort();
    const properties = {};

    for (const key of keys) {
        const values = items
            .filter(item => Object.prototype.hasOwnProperty.call(item, key))
            .map(item => item[key]);
        const types = {};
        for (const value of values) incrementType(types, value);
        const property = {
            present: values.length,
            missing: items.length - values.length,
            types
        };
        if (values.length > 0 && values.every(value => typeof value === 'string')) {
            property.stringSize = summarizeStringValues(values);
        }
        properties[key] = property;
    }

    return {
        type: 'object',
        properties
    };
}

function summarizeArrayItems(items) {
    const types = {};
    for (const item of items) incrementType(types, item);
    const summary = { types };

    if (items.length > 0 && items.every(item => typeof item === 'string')) {
        summary.type = 'string';
        summary.stringSize = summarizeStringValues(items);
    } else if (items.length > 0 && items.every(isPlainObject)) {
        Object.assign(summary, summarizeObjectArray(items));
    }

    return summary;
}

function describeValue(value, path, ancestors) {
    const type = valueType(value);
    if (type === 'undefined' || type === 'function' || type === 'symbol' || type === 'bigint') {
        throw new TypeError(`External variable ${path} has unsupported type ${type}.`);
    }
    if (type === 'number' && !Number.isFinite(value)) {
        throw new TypeError(`External variable ${path} must contain only finite numbers.`);
    }
    if (type === 'object' && value !== null && !isPlainObject(value)) {
        throw new TypeError(`External variable ${path} must contain only plain objects.`);
    }
    if (value && typeof value === 'object') {
        if (ancestors.has(value)) {
            throw new TypeError(`External variable ${path} contains a circular reference.`);
        }
        ancestors.add(value);
    }

    let descriptor;
    if (type === 'string') {
        descriptor = {
            path,
            type,
            estimatedBytes: primitiveSerializedBytes(value, path),
            ...stringMetrics(value)
        };
    } else if (type === 'array') {
        const itemBytes = [];
        for (let index = 0; index < value.length; index += 1) {
            const itemDescriptor = describeValue(value[index], `${path}[${index}]`, ancestors);
            itemBytes.push(itemDescriptor.estimatedBytes);
        }
        descriptor = {
            path,
            type,
            items: value.length,
            estimatedBytes: arraySerializedBytes(itemBytes),
            itemSize: numericStats(itemBytes),
            itemShape: summarizeArrayItems(value)
        };
    } else if (type === 'object') {
        const properties = {};
        for (const key of Object.keys(value).sort()) {
            properties[key] = describeValue(value[key], `${path}.${key}`, ancestors);
        }
        descriptor = {
            path,
            type,
            properties: Object.keys(properties).length,
            estimatedBytes: objectSerializedBytes(value, properties),
            children: properties
        };
    } else {
        descriptor = {
            path,
            type,
            estimatedBytes: primitiveSerializedBytes(value, path)
        };
    }

    if (value && typeof value === 'object') ancestors.delete(value);
    return descriptor;
}

function describeVariables(variables) {
    if (!isPlainObject(variables)) {
        throw new TypeError('External variables must be a plain object.');
    }
    const descriptors = {};
    for (const name of Object.keys(variables).sort()) {
        descriptors[name] = describeValue(variables[name], name, new WeakSet());
    }
    return {
        sizeBasis: 'serialized-json-utf8',
        variables: Object.keys(descriptors).length,
        estimatedBytes: objectSerializedBytes(variables, descriptors),
        descriptors
    };
}

module.exports = {
    describeVariables
};
