const { Readable } = require('stream');

function headersToObject(headers) {
    return Object.fromEntries(headers.entries());
}

async function parseResponseBody(response) {
    try {
        return await response.json();
    } catch {
        try {
            return await response.text();
        } catch {
            return null;
        }
    }
}

async function parseJsonBody(response) {
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text);
}

async function buildHttpError(url, response) {
    const details = await parseResponseBody(response);
    const error = new Error(`Request to ${url} failed with status code ${response.status}`);
    error.isHttpError = true;
    error.statusCode = response.status;
    error.details = details;
    error.response = { status: response.status, data: details };
    return error;
}

async function fetchJsonResponse(url, { method = 'POST', headers = {}, body } = {}) {
    const response = await fetch(url, { method, headers, body });
    if (!response.ok) {
        throw await buildHttpError(url, response);
    }
    const data = await parseJsonBody(response);
    return {
        data,
        status: response.status,
        headers: headersToObject(response.headers)
    };
}

async function fetchBinaryResponse(url, { method = 'GET', headers = {}, body } = {}) {
    const response = await fetch(url, { method, headers, body });
    if (!response.ok) {
        throw await buildHttpError(url, response);
    }
    const data = Buffer.from(await response.arrayBuffer());
    return {
        data,
        status: response.status,
        headers: headersToObject(response.headers)
    };
}

async function fetchStreamResponse(url, { method = 'POST', headers = {}, body } = {}) {
    const response = await fetch(url, { method, headers, body });
    if (!response.ok) {
        throw await buildHttpError(url, response);
    }
    if (!response.body) {
        throw new Error(`Request to ${url} did not return a readable stream`);
    }
    return {
        data: Readable.fromWeb(response.body),
        status: response.status,
        headers: headersToObject(response.headers)
    };
}

module.exports = {
    fetchJsonResponse,
    fetchBinaryResponse,
    fetchStreamResponse
};
