export type SttSegment = {
  start: number;
  end: number;
  text: string;
  avg_logprob: number;
};

export type SttResult = {
  full_text: string;
  language: string;
  language_probability: number;
  duration_seconds: number;
  noise_reduction_applied: boolean;
  segments: SttSegment[];
};

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export function sanitizeTranscription(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function getWhisperProvider(): string {
  return (process.env.WHISPER_PROVIDER ?? "local").toLowerCase();
}

async function runLocalStt(
  audioBytes: Buffer,
  sttBaseUrl: string,
  filename: string,
): Promise<SttResult> {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(audioBytes)]);
  form.append("audio", blob, filename);

  const res = await fetch(`${sttBaseUrl.replace(/\/$/, "")}/transcribe`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(`STT request failed: ${res.status}`);
  }

  const result = (await res.json()) as SttResult;
  return {
    ...result,
    full_text: sanitizeTranscription(result.full_text),
  };
}

async function runOpenAiStt(
  audioBytes: Buffer,
  filename: string,
): Promise<SttResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for WHISPER_PROVIDER=openai");
  }

  const model = process.env.OPENAI_WHISPER_MODEL ?? "whisper-1";
  const form = new FormData();
  const blob = new Blob([new Uint8Array(audioBytes)]);
  form.append("file", blob, filename);
  form.append("model", model);
  form.append("language", "pt");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`OpenAI STT request failed: ${res.status}`);
  }

  const body = (await res.json()) as { text?: string };
  const fullText = sanitizeTranscription(body.text ?? "");

  return {
    full_text: fullText,
    language: "pt",
    language_probability: 1,
    duration_seconds: 0,
    noise_reduction_applied: false,
    segments: [],
  };
}

export async function runSttOnAudioBytes(
  audioBytes: Buffer,
  sttBaseUrl: string,
  filename = "voice.ogg",
): Promise<SttResult> {
  if (audioBytes.length > MAX_AUDIO_BYTES) {
    throw new Error("Audio file exceeds 25 MB limit");
  }

  const provider = getWhisperProvider();
  if (provider === "local") {
    return runLocalStt(audioBytes, sttBaseUrl, filename);
  }
  return runOpenAiStt(audioBytes, filename);
}
