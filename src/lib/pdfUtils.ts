import * as pdfjsLib from 'pdfjs-dist';
import { createWorker, createScheduler } from 'tesseract.js';

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
  const scheduler = createScheduler();
  const numWorkers = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? Math.min(navigator.hardwareConcurrency, 4) : 2;

  for (let w = 0; w < numWorkers; w++) {
    const worker = await createWorker('guj+eng');
    scheduler.addWorker(worker);
  }

  // The regex for rule-based filtering (catches prices, dates, ad-related words)
  const adRegex = /₹|રૂ\.?|Rs|કિંમત|વર્ષ|અંક|તંત્રી|પ્રકાશક|મુદ્રક|પાનું|RNI|Vol|જાહેરખબર|જાહેરાત|advertisement|ઓફર|સેલ|ડિસ્કાઉન્ટ|બુકિંગ|offer|sale|discount/i;

  const baseProgress = 10;
  const totalOcrProgress = 40; // allocating 40% to PDF+OCR
  const pageBudget = totalOcrProgress / pagesToProcess;
  
  let completedPages = 0;

  const processPage = async (i: number) => {
    if (isCancelled()) throw new Error("Cancelled by user");
    
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); 
    
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No canvas context");

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport: viewport,
    } as any).promise;
    
    // Run OCR directly on the canvas element (skips base64 encoding overhead)
    const { data } = await scheduler.addJob('recognize', canvas);
    
    // Immediately clear canvas to free memory
    canvas.width = 0;
    canvas.height = 0;

    completedPages++;
    const currentProgress = baseProgress + (completedPages * pageBudget);
    onProgress(`Processing Pages (${completedPages}/${pagesToProcess})...`, Math.floor(currentProgress));

    return { data, height: viewport.height };
  };

  const pageIndices = Array.from({ length: pagesToProcess }, (_, i) => i + 1);
  const resultsPromises: Promise<{ data: any; height: number }>[] = [];
  const executing = new Set<Promise<any>>();

  for (const i of pageIndices) {
    if (isCancelled()) throw new Error("Cancelled by user");
    
    const p = Promise.resolve().then(() => processPage(i));
    resultsPromises.push(p);
    
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);
    
    if (executing.size >= numWorkers) {
      await Promise.race(executing);
    }
  }

  const orderedResults = await Promise.all(resultsPromises);
  await scheduler.terminate();

  for (const result of orderedResults) {
    const paragraphs = (result.data as any).paragraphs;

    // 1. Cut by page position & 2. Rule-based filter & 3. Structure heuristics
    if (paragraphs) {
      for (const p of paragraphs) {
        // Cut top 12% and bottom 12% (Masthead, page numbers)
        const isTop = p.bbox.y0 < result.height * 0.12;
        const isBottom = p.bbox.y1 > result.height * 0.88;
        if (isTop || isBottom) continue;

        // Apply Regex rules
        if (adRegex.test(p.text)) continue;

        // Structure heuristic: drop very short disconnected blocks
        if (p.text.length < 30) continue;
        
        fullText += p.text + "\n\n";
      }
    } else {
      // Fallback if paragraphs are not parsed properly
      fullText += result.data.text + "\n\n";
    }
  }

  onProgress("Cleaning up text...", 80);
  let cleanedText = fullText
    .replace(/-\n/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleanedText;
}
