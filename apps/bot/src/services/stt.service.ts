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

export async function runSttOnAudioBytes(
  audioBytes: Buffer,
  sttBaseUrl: string,
  filename = "voice.ogg"
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

  return (await res.json()) as SttResult;
}
