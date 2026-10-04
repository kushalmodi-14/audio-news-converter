"use client";

import { useState, useCallback, useRef } from "react";
import { UploadCloud, FileAudio, Loader2, CheckCircle2, Settings, XCircle, ListMusic } from "lucide-react";
import { toast } from "sonner";
import { processPDF } from "@/lib/pdfUtils";
import { generateAndStitchAudio } from "@/lib/audioUtils";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ stage: "", percent: 0 });
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [timestamps, setTimestamps] = useState<{title: string; timeStr: string}[]>([]);
  const [geminiModel, setGeminiModel] = useState("gemini-3.8-flash");
  
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [summaryData, setSummaryData] = useState<any | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
      setExtractedText(null);
      setSummaryData(null);
    }
  }, []);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleProcess = async () => {
    if (!file) return;

    const hfSpaceUrl = process.env.NEXT_PUBLIC_HF_SPACE_URL;

    if (!hfSpaceUrl) {
      alert("Please configure NEXT_PUBLIC_HF_SPACE_URL in your .env file or environment first. It should be the space ID, e.g., 'Kushalmodi14/gujarati-tts-api'.");
      return;
    }

    setIsProcessing(true);
    setAudioUrl(null);
    
    abortControllerRef.current = new AbortController();
    const isCancelled = () => abortControllerRef.current?.signal.aborted || false;
    
    try {
      let text = extractedText;
      let summary = summaryData;

      if (!text) {
        setProgress({ stage: "Parsing PDF...", percent: 10 });
        
        // Phase 2 & 3: PDF Parsing & OCR
        text = await processPDF(file, (stage, percent) => {
          setProgress({ stage, percent });
        }, isCancelled);

        if (!text) {
           throw new Error("No text extracted from PDF");
        }
        setExtractedText(text);
      }
      
      if (!summary) {
        setProgress({ stage: "Summarizing News with AI...", percent: 50 });
        const summaryRes = await fetch("/api/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, modelSelection: geminiModel }),
          signal: abortControllerRef.current?.signal
        });
        
        if (!summaryRes.ok) {
          const errorData = await summaryRes.json();
          throw new Error(errorData.error || "Failed to summarize text");
        }
        
        summary = (await summaryRes.json()).summary;
        setSummaryData(summary);
      }
      
      // Phase 4 & 5: Text to Speech & FFmpeg Stitching
      setProgress({ stage: "Generating Audio...", percent: 60 });
      
      const { blob: audioBlob, timestamps: generatedTimestamps } = await generateAndStitchAudio(summary, hfSpaceUrl, (stage, percent) => {
        setProgress({ stage, percent });
      }, isCancelled);

      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
      setTimestamps(generatedTimestamps);
      setProgress({ stage: "Done!", percent: 100 });
      
    } catch (err: any) {
      console.error(err);
      if (err.message === "Cancelled by user") {
        setProgress({ stage: "Cancelled", percent: 0 });
      } else {
        setProgress({ stage: "Error occurred", percent: 0 });
        if (err.message.includes("503") || err.message.includes("high demand")) {
          toast.error("AI is experiencing high demand. Please wait a few seconds and click Retry.");
        } else {
          toast.error(err.message || "An unexpected error occurred during processing.");
        }
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-slate-950 dark:via-gray-900 dark:to-slate-900 font-sans text-slate-800 dark:text-slate-200 selection:bg-indigo-200">
      <main className="max-w-4xl mx-auto px-6 py-20 flex flex-col items-center">
        {/* Header Section */}
        <div className="text-center space-y-4 mb-16">
          <h1 className="text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-cyan-500">
            Gujarati PDF to MP3
          </h1>
          <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto font-medium">
            Transform your Gujarati newspapers and documents into high-quality audio instantly. All processing happens right here in your browser.
          </p>
        </div>

        {/* Settings removed: now using environment variable */}

        {/* Upload Zone */}
        {!audioUrl && !isProcessing && (
          <div className="w-full max-w-2xl group">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="relative rounded-3xl border-2 border-dashed border-indigo-200 dark:border-indigo-800/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm p-12 flex flex-col items-center justify-center transition-all duration-300 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-white dark:hover:bg-slate-900/80 shadow-sm hover:shadow-xl"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-cyan-500/5 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div className="h-20 w-20 bg-indigo-50 dark:bg-indigo-900/40 rounded-full flex items-center justify-center mb-6 text-indigo-500 transition-transform group-hover:scale-110 duration-300">
                <UploadCloud size={40} strokeWidth={1.5} />
              </div>
              
              <h3 className="text-xl font-bold mb-2 z-10">
                {file ? file.name : "Drag & drop your PDF here"}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 text-center max-w-xs z-10">
                {file ? "Ready to convert this file into MP3 audio." : "Supports Gujarati PDF files up to 50MB."}
              </p>
              
              <div className="flex gap-4 relative z-10">
                {!file && (
                  <label className="cursor-pointer bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-6 py-3 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-semibold">
                    Browse Files
                    <input
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          setFile(e.target.files[0]);
                          setExtractedText(null);
                          setSummaryData(null);
                        }
                      }}
                    />
                  </label>
                )}
                {file && (
                  <div className="flex flex-col gap-4">
                    <select
                      value={geminiModel}
                      onChange={(e) => setGeminiModel(e.target.value)}
                      className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 font-medium cursor-pointer"
                    >
                      <option value="gemini-3.8-flash">⚡ Gemini 3.8 Flash (General purpose, fast)</option>
                      <option value="gemini-3.7-flash">⚡ Gemini 3.7 Flash (Coding + complex tasks)</option>
                      <option value="gemini-3.6-flash">⚡ Gemini 3.6 Flash (General multimodal)</option>
                      <option value="gemini-3.5-flash">💰 Gemini 3.5 Flash (Routine/high-throughput)</option>
                      <option value="gemini-3.5-flash-lite">💰 Gemini 3.5 Flash-Lite (Cheap + high volume)</option>
                      <option value="gemini-3.1-pro-preview">🧠 Gemini 3.1 Pro (Complex reasoning)</option>
                    </select>
                    <button
                      onClick={handleProcess}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none transition-colors font-semibold flex items-center justify-center gap-2 disabled:opacity-50 w-full"
                    >
                      {summaryData ? "Retry Audio Generation" : (extractedText ? "Retry LLM Summarization" : "Start Conversion")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Progress Indicator */}
        {isProcessing && (
          <div className="w-full max-w-xl bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xl">
            <div className="flex flex-col items-center">
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-indigo-400 blur-xl opacity-20 rounded-full animate-pulse" />
                <Loader2 size={48} className="text-indigo-500 animate-spin relative z-10" />
              </div>
              
              <h3 className="text-2xl font-bold mb-2 text-center">{progress.stage}</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-8">This might take a few moments...</p>
              
              <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <div className="w-full flex justify-between mt-3 text-sm font-medium text-slate-400 mb-6">
                <span>0%</span>
                <span>{progress.percent}%</span>
                <span>100%</span>
              </div>
              
              <button
                onClick={handleCancel}
                className="flex items-center justify-center gap-2 px-6 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-full font-medium transition-colors"
              >
                <XCircle size={18} />
                Cancel Processing
              </button>
            </div>
          </div>
        )}

        {/* Results Component */}
        {audioUrl && !isProcessing && (
          <div className="w-full max-w-2xl bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-green-200 dark:border-green-900/30 rounded-3xl p-8 shadow-xl animate-in fade-in zoom-in duration-500">
            <div className="flex flex-col items-center text-center">
              <div className="h-16 w-16 bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 size={32} strokeWidth={2} />
              </div>
              <h3 className="text-2xl font-bold mb-2">Conversion Complete!</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-8">
                Your Gujarati newspaper has been successfully converted to audio.
              </p>
              
              <div className="w-full bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 mb-8 border border-slate-100 dark:border-slate-800">
                <audio controls className="w-full mb-6" src={audioUrl}>
                  Your browser does not support the audio element.
                </audio>

                {timestamps.length > 0 && (
                  <div className="text-left bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm max-h-64 overflow-y-auto">
                    <h4 className="font-bold mb-3 flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                      <ListMusic size={18} /> Chapters
                    </h4>
                    <div className="space-y-2">
                      {timestamps.map((ts, idx) => (
                        <div key={idx} className="flex gap-4 items-start text-sm hover:bg-slate-50 dark:hover:bg-slate-800 p-2 rounded-lg transition-colors cursor-pointer">
                          <span className="font-mono text-indigo-500 font-semibold w-12 shrink-0">{ts.timeStr}</span>
                          <span className="text-slate-700 dark:text-slate-300 line-clamp-2">{ts.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setAudioUrl(null);
                    setTimestamps([]);
                    setFile(null);
                    setExtractedText(null);
                    setSummaryData(null);
                    setProgress({ stage: "", percent: 0 });
                  }}
                  className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-6 py-3 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-semibold"
                >
                  Convert Another
                </button>
                <a
                  href={audioUrl}
                  download={file ? file.name.replace(/\.[^/.]+$/, "") + "-audio.mp3" : "gujarati-audio.mp3"}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none transition-colors font-semibold flex items-center gap-2"
                >
                  Download MP3
                </a>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
