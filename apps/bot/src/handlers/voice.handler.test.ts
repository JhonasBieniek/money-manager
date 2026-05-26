import { describe, expect, it, vi } from "vitest";
import { formatVoiceDebugReply } from "./voice.handler.js";
import { parseExpenseUtterance } from "../services/parse-expense-utterance.js";
import type { SttResult } from "../services/stt.service.js";

describe("formatVoiceDebugReply", () => {
  it("formats debug block with transcription and parse", () => {
    const stt: SttResult = {
      full_text: "gastei 50 reais no mercado no pix",
      language: "pt",
      language_probability: 0.98,
      duration_seconds: 4.2,
      noise_reduction_applied: false,
      segments: [],
    };
    const parsed = parseExpenseUtterance(stt.full_text);
    const reply = formatVoiceDebugReply(stt, parsed);

    expect(reply).toContain("STT (pt, 4.2s, ruído: não)");
    expect(reply).toContain("Transcrição: gastei 50 reais no mercado no pix");
    expect(reply).toContain('"amount":50');
    expect(reply).toContain('"paymentMethod":"pix"');
  });

  it("shows noise reduction when applied", () => {
    const stt: SttResult = {
      full_text: "teste",
      language: "pt",
      language_probability: 1,
      duration_seconds: 1,
      noise_reduction_applied: true,
      segments: [],
    };
    const reply = formatVoiceDebugReply(stt, parseExpenseUtterance("teste"));
    expect(reply).toContain("ruído: sim");
  });
});

describe("runSttOnAudioBytes", () => {
  it("posts multipart audio to STT service", async () => {
    const mockJson = vi.fn().mockResolvedValue({
      full_text: "ok",
      language: "pt",
      language_probability: 1,
      duration_seconds: 1,
      noise_reduction_applied: false,
      segments: [],
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: mockJson });
    vi.stubGlobal("fetch", fetchMock);

    const { runSttOnAudioBytes } = await import("../services/stt.service.js");
    const result = await runSttOnAudioBytes(Buffer.from("audio"), "http://localhost:8001");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8001/transcribe",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.full_text).toBe("ok");

    vi.unstubAllGlobals();
  });
});
