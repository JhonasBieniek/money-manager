import { afterEach, describe, expect, it, jest } from "@jest/globals";
import {
  runSttOnAudioBytes,
  sanitizeTranscription,
} from "./stt.service.js";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.WHISPER_PROVIDER;
  delete process.env.OPENAI_API_KEY;
});

describe("sanitizeTranscription", () => {
  it("trim e colapsa espaços", () => {
    expect(sanitizeTranscription("  olá   mundo  ")).toBe("olá mundo");
  });
});

describe("runSttOnAudioBytes", () => {
  it("rejeita áudio acima de 25 MB", async () => {
    const huge = Buffer.alloc(25 * 1024 * 1024 + 1);
    await expect(runSttOnAudioBytes(huge, "http://localhost:8001")).rejects.toThrow(
      "25 MB",
    );
  });

  it("chama serviço local quando WHISPER_PROVIDER=local", async () => {
    process.env.WHISPER_PROVIDER = "local";
    const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        full_text: " 40 reais em manga ",
        language: "pt",
        language_probability: 0.95,
        duration_seconds: 1,
        noise_reduction_applied: false,
        segments: [],
      }),
    } as Response);
    global.fetch = mockFetch;

    const result = await runSttOnAudioBytes(
      Buffer.from("audio"),
      "http://localhost:8001",
      "voice.ogg",
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8001/transcribe",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.full_text).toBe("40 reais em manga");
  });

  it("usa serviço local por padrão (sem WHISPER_PROVIDER)", async () => {
    const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        full_text: "compra no mercado",
        language: "pt",
        language_probability: 0.9,
        duration_seconds: 1,
        noise_reduction_applied: false,
        segments: [],
      }),
    } as Response);
    global.fetch = mockFetch;

    await runSttOnAudioBytes(
      Buffer.from("audio"),
      "http://localhost:8001",
      "voice.ogg",
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8001/transcribe",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("chama OpenAI apenas quando WHISPER_PROVIDER=openai", async () => {
    process.env.WHISPER_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "  compra no mercado  " }),
    } as Response);
    global.fetch = mockFetch;

    const result = await runSttOnAudioBytes(Buffer.from("audio"), "", "voice.ogg");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/audio/transcriptions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.full_text).toBe("compra no mercado");
    expect(result.language_probability).toBe(1);
  });
});
