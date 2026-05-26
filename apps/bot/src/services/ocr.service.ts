export type OcrResult = {
  full_text: string;
  confidence: number;
  lines: Array<{ text: string; confidence: number }>;
};

export async function runOcrOnImageBytes(
  imageBytes: Buffer,
  ocrBaseUrl: string
): Promise<OcrResult> {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(imageBytes)]);
  form.append("image", blob, "capture.jpg");

  const res = await fetch(`${ocrBaseUrl.replace(/\/$/, "")}/ocr`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(`OCR request failed: ${res.status}`);
  }

  return (await res.json()) as OcrResult;
}
