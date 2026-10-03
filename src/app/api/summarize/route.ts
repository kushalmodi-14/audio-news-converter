import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { text, modelSelection } = await req.json();

    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured on server" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: modelSelection || "gemini-1.5-flash-latest",
      generationConfig: { responseMimeType: "application/json" }
    });

    const systemPrompt = `You are a professional News Summarizer for Gujarati newspapers.
Your task is to take OCR text from a newspaper, discard ALL advertisements, classifieds, random short texts, and non-news elements.
Mainly focus on extracting and summarizing the real News Headlines and the core body paragraphs of the news.
The output MUST be in Gujarati. Make the summaries clear, continuous, and highly suitable for Text-to-Speech audio generation. Do not include markdown formatting like asterisks or hashes.

IMPORTANT: You MUST return the output as a valid JSON array of objects. 
Each object must have exactly two keys:
- "headline": The title of the news article (in Gujarati).
- "body": The summarized body of the news article (in Gujarati).

Example format:
[
  { "headline": "ગુજરાતમાં વરસાદની આગાહી", "body": "હવામાન વિભાગ દ્વારા આગામી પાંચ દિવસ..." },
  { "headline": "શેરબજારમાં ઉછાળો", "body": "સેન્સેક્સમાં આજે મોટો ઉછાળો જોવા મળ્યો..." }
]`;

    const prompt = `${systemPrompt}\n\nHere is the raw OCR text to process:\n\n${text}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const finalNewsJSON = JSON.parse(response.text());

    return NextResponse.json({ summary: finalNewsJSON });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return NextResponse.json({ error: error.message || "Failed to summarize text" }, { status: 500 });
  }
}
