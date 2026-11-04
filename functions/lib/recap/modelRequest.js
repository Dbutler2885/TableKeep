export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
/** Returns a function that posts a request and resolves to the parsed JSON answer. */
export function postToResponsesApi(undici, { apiKey, endpoint, timeoutMs }) {
    const dispatcher = new undici.Agent({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs });
    return async (request) => {
        const response = await undici.fetch(endpoint, {
            method: 'POST',
            headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
            body: JSON.stringify(request),
            signal: AbortSignal.timeout(timeoutMs),
            dispatcher,
        });
        if (!response.ok)
            throw new Error(`The model request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
        return (await response.json());
    };
}
