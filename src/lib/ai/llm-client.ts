interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface ChatCompletionChoice {
  message?: {
    content?: string | null;
  };
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[];
  error?: {
    message?: string;
  };
}

const DEFAULT_BASE_URL = "https://api.laozhang.ai/v1";
const DEFAULT_MODEL = "gemini-3-flash-preview";
const REQUEST_TIMEOUT_MS = 8_000;

function resolveConfig(): { apiKey: string; baseUrl: string; model: string } {
  const apiKey = process.env.AI_LLM_API_KEY?.trim() ?? "";
  if (!apiKey) {
    throw new Error("AI_LLM_API_KEY is required");
  }

  const baseUrl = (process.env.AI_LLM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.AI_LLM_MODEL?.trim() || DEFAULT_MODEL;
  return { apiKey, baseUrl, model };
}

export async function requestChatCompletion(messages: ChatMessage[]): Promise<string> {
  const { apiKey, baseUrl, model } = resolveConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages,
      }),
      signal: controller.signal,
    });

    const data = (await response.json()) as ChatCompletionResponse;
    if (!response.ok) {
      throw new Error(data.error?.message ?? `LLM request failed (${response.status})`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("LLM response missing content");
    }

    return content;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("LLM request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
