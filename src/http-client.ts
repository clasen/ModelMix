import { Readable } from 'stream';
import type { ReadableStream as WebReadableStream } from 'stream/web';

export interface HttpRequestOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: BodyInit | null;
    signal?: AbortSignal;
}

export interface HttpResponse<T> {
    data: T;
    status: number;
    headers: Record<string, string>;
}

export interface HttpError extends Error {
    isHttpError: true;
    statusCode: number;
    details: unknown;
    response: { status: number; data: unknown };
}

function headersToObject(headers: Headers): Record<string, string> {
    return Object.fromEntries(headers.entries());
}

function sanitizeUrl(url: string): string {
    try {
        const parsed = new URL(url);
        parsed.username = '';
        parsed.password = '';
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString();
    } catch {
        return String(url).replace(/[?#].*$/, '');
    }
}

async function parseResponseBody(response: Response): Promise<unknown> {
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

async function parseJsonBody(response: Response): Promise<any> {
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text);
}

async function buildHttpError(url: string, response: Response): Promise<HttpError> {
    const details = await parseResponseBody(response);
    const error = new Error(`Request to ${sanitizeUrl(url)} failed with status code ${response.status}`) as HttpError;
    error.isHttpError = true;
    error.statusCode = response.status;
    error.details = details;
    error.response = { status: response.status, data: details };
    return error;
}

export async function fetchJsonResponse(
    url: string,
    { method = 'POST', headers = {}, body, signal }: HttpRequestOptions = {}
): Promise<HttpResponse<any>> {
    const response = await fetch(url, { method, headers, body, signal });
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

export async function fetchBinaryResponse(
    url: string,
    { method = 'GET', headers = {}, body, signal }: HttpRequestOptions = {}
): Promise<HttpResponse<Buffer>> {
    const response = await fetch(url, { method, headers, body, signal });
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

export async function fetchStreamResponse(
    url: string,
    { method = 'POST', headers = {}, body, signal }: HttpRequestOptions = {}
): Promise<HttpResponse<Readable>> {
    const response = await fetch(url, { method, headers, body, signal });
    if (!response.ok) {
        throw await buildHttpError(url, response);
    }
    if (!response.body) {
        throw new Error(`Request to ${sanitizeUrl(url)} did not return a readable stream`);
    }
    return {
        data: Readable.fromWeb(response.body as WebReadableStream),
        status: response.status,
        headers: headersToObject(response.headers)
    };
}
