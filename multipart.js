const fs = require('fs');
const path = require('path');

function stripContentTypeHeader(headers = {}) {
    const sanitizedHeaders = {};
    for (const [name, value] of Object.entries(headers)) {
        if (name.toLowerCase() !== 'content-type') {
            sanitizedHeaders[name] = value;
        }
    }
    return sanitizedHeaders;
}

function createMultipartFormData({ fields = {}, files = [] } = {}) {
    if (typeof FormData !== 'function' || typeof Blob !== 'function') {
        throw new Error('Native FormData/Blob are not available in this Node.js runtime');
    }

    const formData = new FormData();

    for (const [name, value] of Object.entries(fields)) {
        if (value === undefined || value === null) continue;
        const normalizedValue = typeof value === 'string' ? value : JSON.stringify(value);
        formData.append(name, normalizedValue);
    }

    for (const file of files) {
        if (!file || !file.name) {
            throw new Error('Each multipart file must include a "name" property');
        }

        let data = file.data;
        let filename = file.filename;

        if (file.path) {
            const absolutePath = path.resolve(file.path);
            data = fs.readFileSync(absolutePath);
            filename = filename || path.basename(absolutePath);
        }

        if (typeof data === 'string') {
            data = Buffer.from(data);
        } else if (data instanceof ArrayBuffer) {
            data = Buffer.from(data);
        } else if (ArrayBuffer.isView(data)) {
            data = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
        }

        if (!Buffer.isBuffer(data)) {
            throw new Error(`Invalid multipart file data for "${file.name}" - expected Buffer, ArrayBuffer, typed array, string, or file path`);
        }

        const blob = new Blob([data], {
            type: file.contentType || 'application/octet-stream'
        });

        formData.append(file.name, blob, filename || 'file');
    }

    return formData;
}

function buildRequestBodyAndHeaders(options, headers) {
    if (options?.body instanceof FormData) {
        const requestOptions = { ...options };
        delete requestOptions.body;
        return {
            options: requestOptions,
            body: options.body,
            headers: stripContentTypeHeader(headers)
        };
    }

    if (options?.multipart) {
        const requestOptions = { ...options };
        const multipartConfig = requestOptions.multipart || {};
        delete requestOptions.multipart;

        const serializedFields = {};
        for (const [key, value] of Object.entries(requestOptions)) {
            if (value === undefined) continue;
            serializedFields[key] = value;
        }

        const body = createMultipartFormData({
            fields: {
                ...serializedFields,
                ...(multipartConfig.fields || {})
            },
            files: multipartConfig.files || []
        });

        return {
            options: requestOptions,
            body,
            headers: stripContentTypeHeader(headers)
        };
    }

    return {
        options,
        body: JSON.stringify(options),
        headers
    };
}

module.exports = {
    stripContentTypeHeader,
    createMultipartFormData,
    buildRequestBodyAndHeaders
};
