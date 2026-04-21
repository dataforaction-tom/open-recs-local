/**
 * List models exposed by an OpenAI-compatible server.
 *
 * Convention: `baseUrl` includes the `/v1` suffix (same shape as used by the
 * adapter for `chat/completions`), so we append `/models` here. Examples:
 *   - Ollama:  `http://ollama:11434/v1`  -> `http://ollama:11434/v1/models`
 *   - OpenAI:  `https://api.openai.com/v1` -> `https://api.openai.com/v1/models`
 *
 * Ollama returns both chat and embedding models on this endpoint; filtering is
 * a UI concern, not ours.
 */
export async function listModels(
  baseUrl: string,
  apiKey?: string,
): Promise<{ id: string }[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/models`;
  const res = await fetch(url, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });
  if (!res.ok) {
    throw new Error(`models endpoint returned ${res.status}`);
  }
  const body = (await res.json()) as { data: { id: string }[] };
  return body.data.map((m) => ({ id: m.id }));
}
