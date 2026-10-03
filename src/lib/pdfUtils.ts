import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';

// Setup PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

export async function processPDF(
  file: File, 
  onProgress: (stage: string, percent: number) => void,
  isCancelled: () => boolean
): Promise<string> {
  onProgress("Loading PDF...", 5);
  
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  const maxPagesEnv = process.env.NEXT_PUBLIC_MAX_PAGES;
  const maxPages = maxPagesEnv ? parseInt(maxPagesEnv, 10) : pdf.numPages;
  const pagesToProcess = Math.min(pdf.numPages, maxPages);
  
  let fullText = "";

  onProgress("Initializing OCR Engine...", 10);
  // In Tesseract.js v5+, language loading is handled natively inside createWorker
  // We use guj+eng so english words like Rs, Vol, RNI in headers can be detected for filtering
  const worker = await createWorker('guj+eng');

  // The regex for rule-based filtering (catches prices, dates, ad-related words)
  const adRegex = /₹|રૂ\.?|Rs|કિંમત|વર્ષ|અંક|તંત્રી|પ્રકાશક|મુદ્રક|પાનું|RNI|Vol|જાહેરખબર|જાહેરાત|advertisement|ઓફર|સેલ|ડિસ્કાઉન્ટ|બુકિંગ|offer|sale|discount/i;

  for (let i = 1; i <= pagesToProcess; i++) {
    if (isCancelled()) throw new Error("Cancelled by user");
    onProgress(`Extracting Page ${i} of ${pagesToProcess}...`, 10 + Math.floor((i / pagesToProcess) * 30));
    
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); 
    
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) continue;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport: viewport,
    } as any).promise;

    const imageUrl = canvas.toDataURL("image/jpeg", 1.0);
    
    onProgress(`Running OCR on Page ${i}...`, 40 + Math.floor((i / pagesToProcess) * 35));

    const { data } = await worker.recognize(imageUrl);
    const paragraphs = (data as any).paragraphs;

    // 1. Cut by page position & 2. Rule-based filter & 3. Structure heuristics
    if (paragraphs) {
      for (const p of paragraphs) {
        // Cut top 12% and bottom 12% (Masthead, page numbers)
        const isTop = p.bbox.y0 < canvas.height * 0.12;
        const isBottom = p.bbox.y1 > canvas.height * 0.88;
        if (isTop || isBottom) continue;

        // Apply Regex rules
        if (adRegex.test(p.text)) continue;

        // Structure heuristic: drop very short disconnected blocks
        if (p.text.length < 30) continue;
        
        fullText += p.text + "\n\n";
      }
    } else {
      // Fallback if paragraphs are not parsed properly
      fullText += data.text + "\n\n";
    }
    
    canvas.width = 0;
    canvas.height = 0;
  }

  await worker.terminate();

  onProgress("Cleaning up text...", 80);
  let cleanedText = fullText
    .replace(/-\n/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleanedText;
}
