import * as pdfjsLib from 'pdfjs-dist';

// Configurar o worker do PDF.js
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }
}

/**
 * Extrai texto completo de um arquivo PDF 100% no navegador (offline)
 */
export async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageStrings = textContent.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .filter((s: string) => s.trim().length > 0);
    fullText += `--- Página ${i} ---\n` + pageStrings.join(' ') + '\n';
  }

  return fullText;
}
