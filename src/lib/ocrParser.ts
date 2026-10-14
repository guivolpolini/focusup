import { createWorker } from 'tesseract.js';

/**
 * Reconhece texto em imagens (.jpeg, .jpg, .png, .webp) usando OCR WebAssembly local (100% no cliente).
 */
export async function extractTextFromImage(
  imageSource: File | Blob | string,
  onProgress?: (percent: number, status: string) => void
): Promise<string> {
  const worker = await createWorker('por+eng', 1, {
    logger: (m) => {
      if (onProgress && m.status) {
        const pct = typeof m.progress === 'number' ? Math.round(m.progress * 100) : 0;
        onProgress(pct, m.status);
      }
    },
  });

  try {
    const result = await worker.recognize(imageSource);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}
