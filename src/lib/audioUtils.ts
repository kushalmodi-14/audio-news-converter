import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { Client } from '@gradio/client';

export type NewsArticle = { headline: string; body: string };
export type AudioResult = { blob: Blob; timestamps: { title: string; timeStr: string }[] };

// A simple sentence chunker
function chunkText(text: string, maxLength: number = 800): string[] {
  const tokens = text.split(/([.!?।\n]+)/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (let i = 0; i < tokens.length; i += 2) {
    const sentence = tokens[i];
    const punctuation = tokens[i + 1] || "";
    const fullSentence = (sentence + punctuation).trim();
    
    if (!fullSentence) continue;

    if ((currentChunk + " " + fullSentence).length > maxLength) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = fullSentence;
    } else {
      currentChunk += (currentChunk ? " " : "") + fullSentence;
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getDuration = async (blob: Blob): Promise<number> => {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioContextClass();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  return audioBuffer.duration;
};

const formatTime = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

let ffmpegInstance: FFmpeg | null = null;
async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  const ffmpeg = new FFmpeg();
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  ffmpegInstance = ffmpeg;
  return ffmpegInstance;
}

export async function generateAndStitchAudio(
  articles: NewsArticle[], 
  hfSpaceUrl: string,
  onProgress: (stage: string, percent: number) => void,
  isCancelled: () => boolean
): Promise<AudioResult> {
  if (!hfSpaceUrl) {
    throw new Error("Hugging Face Space URL is required.");
  }

  const audioBlobs: Blob[] = [];
  const timestamps: { title: string; timeStr: string }[] = [];
  let client: any = null;
  try {
    onProgress("Connecting to Space (waking up if sleeping)...", 55);
    client = await Client.connect(hfSpaceUrl);
  } catch (err) {
    throw new Error(`Failed to connect to Hugging Face Space. Error: ${err}`);
  }

  // Calculate total chunks and flatten them for parallel processing
  type ChunkTask = {
    globalIndex: number;
    articleIndex: number;
    isFirstChunkOfArticle: boolean;
    text: string;
    blob?: Blob;
  };

  const tasks: ChunkTask[] = [];
  let globalIndex = 0;

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    // "હવે પછીના સમાચાર" means "Next news"
    const prefix = i > 0 ? "હવે પછીના સમાચાર. " : "";
    const textToSpeak = `${prefix}${article.headline}. ${article.body}`;
    const chunks = chunkText(textToSpeak);
    
    for (let j = 0; j < chunks.length; j++) {
      tasks.push({
        globalIndex: globalIndex++,
        articleIndex: i,
        isFirstChunkOfArticle: j === 0,
        text: chunks[j]
      });
    }
  }

  const totalChunks = tasks.length;
  let processedChunks = 0;
  
  // Limit concurrent Gradio connections to 3 to prevent overwhelming the free Space
  const concurrency = 3; 
  const queue = [...tasks];

  const worker = async () => {
    while (queue.length > 0) {
      if (isCancelled()) throw new Error("Cancelled by user");
      const task = queue.shift()!;
      
      let success = false;
      let retries = 3;
      
      while (!success && retries > 0) {
        if (isCancelled()) throw new Error("Cancelled by user");
        try {
          const result: any = await client.predict("/synthesize", [task.text]);
          const audioData = result.data[0];

          let audioBlob: Blob;
          if (typeof audioData === 'object' && audioData.url) {
            const res = await fetch(audioData.url);
            audioBlob = await res.blob();
          } else {
            throw new Error("Unrecognized audio format returned from HF Space.");
          }

          task.blob = audioBlob;
          success = true;
          processedChunks++;
          onProgress(`Generating chunk ${processedChunks} of ${totalChunks}...`, 60 + Math.floor((processedChunks / totalChunks) * 20));
          
        } catch (err) {
          retries--;
          console.warn(`Chunk ${task.globalIndex + 1} failed, retries left: ${retries}`, err);
          if (retries === 0) throw err;
          await delay(3000); 
        }
      }
    }
  };

  // Run workers concurrently
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  // All tasks are complete. Reconstruct order and build timestamps.
  onProgress("Processing generated audio...", 82);
  let currentDurationSeconds = 0;
  
  // Sort back by index just in case
  tasks.sort((a, b) => a.globalIndex - b.globalIndex);

  for (const task of tasks) {
    if (isCancelled()) throw new Error("Cancelled by user");
    if (!task.blob) throw new Error(`Missing audio blob for chunk ${task.globalIndex}`);
    
    if (task.isFirstChunkOfArticle) {
      timestamps.push({
        title: articles[task.articleIndex].headline,
        timeStr: formatTime(currentDurationSeconds)
      });
    }
    
    const chunkDuration = await getDuration(task.blob);
    currentDurationSeconds += chunkDuration;
    audioBlobs.push(task.blob);
  }

  onProgress("Stitching audio chunks together...", 85);
  const ffmpeg = await getFFmpeg();

  const fileNames: string[] = [];
  let concatList = "";

  for (let i = 0; i < audioBlobs.length; i++) {
    if (isCancelled()) throw new Error("Cancelled by user");
    const fileName = `chunk_${i}.wav`;
    fileNames.push(fileName);
    await ffmpeg.writeFile(fileName, await fetchFile(audioBlobs[i]));
    concatList += `file '${fileName}'\n`;
  }

  await ffmpeg.writeFile('concat.txt', concatList);

  onProgress("Finalizing MP3 export...", 95);
  await ffmpeg.exec([
    '-f', 'concat', 
    '-safe', '0', 
    '-i', 'concat.txt', 
    '-c:a', 'libmp3lame', 
    '-metadata', 'title=Gujarati News Audio',
    '-metadata', 'artist=AI News Reader',
    '-metadata', 'album=Gujarati PDF to MP3 Converter',
    'output.mp3'
  ]);

  const data = await ffmpeg.readFile('output.mp3');
  const finalBlob = new Blob([data as any], { type: 'audio/mp3' });
  
  // Cleanup virtual files to free memory
  for (const f of fileNames) await ffmpeg.deleteFile(f);
  await ffmpeg.deleteFile('concat.txt');
  await ffmpeg.deleteFile('output.mp3');

  return { blob: finalBlob, timestamps };
}
