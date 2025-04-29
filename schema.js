function generateJsonSchema(example, descriptions = {}) {
    function detectType(key, value) {
        if (value === null) return { type: 'null' };
        if (typeof value === 'boolean') return { type: 'boolean' };
        if (typeof value === 'number') {
            return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
        }
        if (typeof value === 'string') {
            const schema = { type: 'string' };
            if (/^\S+@\S+\.\S+$/.test(value)) {
                schema.format = 'email';
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                schema.format = 'date';
                if (!descriptions[key]) {
                    schema.description = 'Date in format YYYY-MM-DD';
                }
            } else if (/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.test(value)) {
                schema.format = 'time';
                if (!descriptions[key]) {
                    const hasSeconds = value.split(':').length === 3;
                    schema.description = hasSeconds ?
                        'Time in format HH:MM:SS' :
                        'Time in format HH:MM';
                }
            }
            return schema;
        }
        if (Array.isArray(value)) {
            if (value.length > 0 && typeof value[0] === 'object' && !Array.isArray(value[0])) {
                // Es un array de objetos
                return {
                    type: 'array',
                    items: generateJsonSchema(value[0], descriptions[key] || {})
                };
            } else {
                // Es un array de valores simples
                return {
                    type: 'array',
                    items: value.length > 0 ? detectType(key, value[0]) : {}
                };
            }
        }
        if (typeof value === 'object') {
            return generateJsonSchema(value, descriptions[key] || {});
        }
        return {};
    }

    if (Array.isArray(example)) {
        // Si el ejemplo raíz es un array
        return {
            type: 'array',
            items: generateJsonSchema(example[0], descriptions)
        };
    }

    const schema = {
        type: 'object',
        properties: {},
        required: []
    };

    for (const key in example) {
        const fieldSchema = detectType(key, example[key]);

        if (descriptions[key] && typeof fieldSchema === 'object') {
            fieldSchema.description = descriptions[key];
        }

        schema.properties[key] = fieldSchema;
        schema.required.push(key);
    }

    return schema;
}

module.exports = generateJsonSchema;

// const example = {
//     name: 'Alice',
//     age: 30,
//     email: 'alice@example.com',
//     birthDate: '1990-01-01',
//     isAdmin: false,
//     preferences: {
//         theme: 'dark',
//         notifications: true
//     },
//     tags: ['admin', 'user']
// };

// const descriptions = {
//     name: 'Full name of the user',
//     age: 'Age must be 0 or greater',
//     email: 'User email address',
//     // birthDate: 'User birth date in YYYY-MM-DD format',
//     preferences: {
//         theme: 'Theme preference (light/dark)',
//         notifications: 'Whether notifications are enabled'
//     }
// };

// const schema = generateJsonSchema(example);

// console.log(JSON.stringify(schema, null, 2));
