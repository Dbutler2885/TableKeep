/**
 * Posting a request to OpenAI's Responses API and waiting, possibly for
 * minutes, for the answer.
 *
 * The Responses API sends nothing, not even headers, until a non-streaming
 * answer is complete, and a high-effort recap of a long session can take more
 * than five minutes. Node's built-in fetch gives up after 300 seconds without
 * headers or body data, whatever its abort signal allows, so the request goes
 * through undici's fetch with a dispatcher whose own limits are the caller's
 * timeout as well.
 *
 * `postToResponsesApi` takes undici as an argument, so its unit test can watch
 * what it is given; `callOpenAi` hands it the real one.
 */
import { Agent, fetch } from 'undici';
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
/**
 * Asks OpenAI's Responses API for a recap, waiting as long as `timeoutMs` allows.
 * `endpoint` exists so a test can point the request at a local server.
 */
export function callOpenAi(apiKey, { endpoint = OPENAI_RESPONSES_URL, timeoutMs = 15 * 60 * 1000 } = {}) {
    return postToResponsesApi({ Agent, fetch }, { apiKey, endpoint, timeoutMs });
}
