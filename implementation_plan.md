# Implementation Plan: Gujarati PDF to MP3 Converter

This document outlines the step-by-step plan to build a 100% free, client-side heavy Next.js application that converts Gujarati newspaper PDFs into MP3 audio files. 

By executing this plan, we will bypass Vercel's serverless limits by running all heavy processing (PDF rendering, OCR, and Audio Processing) directly in the user's browser.

---

## Phase 1: Project Setup & UI Foundation
**Goal:** Initialize the project and build the main user interface.

1. **Initialize Next.js:** 
   - Create a new Next.js project using App Router, TypeScript, and TailwindCSS.
2. **Install Core Dependencies:** 
   - `pdfjs-dist` (PDF rendering)
   - `tesseract.js` (OCR)
   - `lucide-react` (Icons)
3. **Build the UI Components:**
   - Create a drag-and-drop file upload zone.
   - Build a progress indicator component to show real-time status (e.g., "Extracting page 1 of 5").
   - Add a results component with an audio player and a "Download MP3" button.

---

## Phase 2: PDF Parsing & Rendering
**Goal:** Convert the uploaded PDF into a format readable by the OCR engine.

1. **Load PDF.js Worker:** Configure `pdfjs-dist` to use its web worker securely in a Next.js client environment.
2. **Extract Pages:** Write a utility function that takes the uploaded `File` object and iterates through every page of the PDF.
3. **Render to Canvas:** Render each PDF page onto an HTML5 `<canvas>` element to generate high-resolution images required for accurate OCR.

---

## Phase 3: Gujarati Optical Character Recognition (OCR)
**Goal:** Extract Gujarati text from the generated images.

1. **Initialize Tesseract Worker:** Set up a `tesseract.js` worker and configure it to download and use the Gujarati language model (`guj.traineddata`).
2. **Process Images:** Loop through the canvases generated in Phase 2 and pass them to the Tesseract worker.
3. **Text Cleanup:** Write a post-processing function to clean up the extracted text (remove excessive line breaks, fix common OCR artifacts, and stitch paragraphs together).

---

## Phase 4: Text-to-Speech (Piper TTS)
**Goal:** Convert the extracted Gujarati text into audio chunks.

*Note: Since compiling Piper WASM natively inside Next.js can be highly unstable, the most reliable and 100% free approach is to deploy the open-source Piper model to a free Hugging Face Space. The Next.js app will call this space.*

1. **Free Backend Setup:** We will provide instructions/script to quickly deploy the `Arjun4707/piper-gujarati-male` model to a Hugging Face Space (Free Tier).
2. **Chunking Logic:** Break the cleaned Gujarati text into smaller, manageable sentences to avoid timeouts and memory overloads.
3. **Audio Generation:** Create an asynchronous function to send text chunks to the Hugging Face Space and receive `.wav` or `.mp3` audio buffers in return.

---

## Phase 5: Audio Concatenation & Export
**Goal:** Stitch the individual audio chunks into a single newspaper audio file.

1. **Install FFmpeg WASM:** Add `@ffmpeg/ffmpeg` and `@ffmpeg/core` to run audio processing in the browser.
2. **Stitch Audio:** Write a function that takes the array of audio buffers from Phase 4, writes them to the FFmpeg virtual file system, and concatenates them sequentially.
3. **Export MP3:** Convert the final stitched audio into an MP3 blob.
4. **Finalize UI:** Pass the MP3 blob URL to the frontend audio player and enable the download button.

---

## Phase 6: Testing & Vercel Deployment
**Goal:** Ensure the app works seamlessly and deploy it.

1. **Local Testing:** Test the workflow with a sample 1-2 page Gujarati newspaper PDF.
2. **Memory Optimization:** Ensure canvas elements and Web Workers are properly destroyed after use to prevent browser memory leaks.
3. **Deploy:** Push the code to GitHub and deploy the repository to Vercel.
