import { NextResponse } from 'next/server';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models';
const RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);
const SUMMARY_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
];
const MAX_RETRIES_PER_MODEL = 4;
const INITIAL_RETRY_DELAY_MS = 2000;
const CHUNK_SIZE = 12000;

function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('Missing Gemini API key. Set GEMINI_API_KEY on the server.');
  }

  return apiKey;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildLessonSummaryInstructions() {
  return `
You are a professional music-lesson summary assistant.

Your job is to create a friendly, parent-facing summary of the class transcript or lesson notes I will provide.

STYLE AND TONE
- Warm, encouraging, and easy for parents to understand
- No technical music jargon unless explained simply
- Write as if the teacher is talking directly to the parent
- Start with a friendly greeting like: "Hello! Your child had a great lesson today, and we made wonderful progress."

CONTENT RULES
- Extract only meaningful teaching moments from the transcript
- Highlight what the child practiced and what they learned
- Create a clear "Assignments and Practice" section including each exercise or piece and what to focus on
- Provide simple "Practice Reminders" at the end
- Do not add anything not mentioned in the transcript
- Do not include filler, small talk, or off-topic chatter
- Keep it clean, clear, and parent-friendly

OUTPUT FORMAT
Follow this structure exactly:

1. Friendly Intro
A warm, positive 1-2 line greeting.

2. Assignments and Practice
List each song or exercise and what the child should focus on.

3. Today's Lesson Summary
A short explanation of what concepts were taught today (notes, rhythms, hand placement, coordination, etc.).

4. Practice Reminders
Simple bullet points to help parents guide practice at home.
  `.trim();
}

function buildLessonSummaryPrompt(transcriptText) {
  return `
${buildLessonSummaryInstructions()}

TRANSCRIPT:
${transcriptText}
  `.trim();
}

function buildChunkPrompt(chunkText, chunkNumber, totalChunks) {
  return `
You are preparing source notes for a parent-facing music lesson summary.

This is chunk ${chunkNumber} of ${totalChunks} from a longer transcript.

Extract only concrete teaching details from this chunk:
- songs, exercises, or pages practiced
- corrections or technique reminders
- concepts taught
- practice assignments

Ignore greetings, filler, repeated phrases, and unrelated chatter.
Return concise bullet points only.

TRANSCRIPT CHUNK:
${chunkText}
  `.trim();
}

function buildCombinedPrompt(chunkSummaries) {
  return `
${buildLessonSummaryInstructions()}

Use the source notes below instead of a raw transcript. Do not mention that the transcript was chunked.

SOURCE NOTES:
${chunkSummaries.join('\n\n')}
  `.trim();
}

function splitTranscriptIntoChunks(transcriptText, chunkSize = CHUNK_SIZE) {
  if (transcriptText.length <= chunkSize) {
    return [transcriptText];
  }

  const paragraphs = transcriptText.split(/\n\s*\n/);
  const chunks = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (!trimmedParagraph) {
      continue;
    }

    if (trimmedParagraph.length > chunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      for (let start = 0; start < trimmedParagraph.length; start += chunkSize) {
        chunks.push(trimmedParagraph.slice(start, start + chunkSize).trim());
      }
      continue;
    }

    const nextChunk = currentChunk ? `${currentChunk}\n\n${trimmedParagraph}` : trimmedParagraph;
    if (nextChunk.length > chunkSize) {
      chunks.push(currentChunk.trim());
      currentChunk = trimmedParagraph;
    } else {
      currentChunk = nextChunk;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

async function callGeminiModel(model, body, apiKey, maxRetries = MAX_RETRIES_PER_MODEL) {
  let delayMs = INITIAL_RETRY_DELAY_MS;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(`${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      return data;
    }

    if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxRetries) {
      await delay(delayMs);
      delayMs *= 2;
      continue;
    }

    const error = new Error(`Gemini error ${response.status}: ${JSON.stringify(data)}`);
    error.status = response.status;
    throw error;
  }

  throw new Error(`Gemini model ${model} failed after ${maxRetries} retries.`);
}

function extractTextFromGeminiResponse(data) {
  return data?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text || '')
    .join('')
    .trim();
}

async function generateWithFallback(body, apiKey) {
  let lastError;

  for (const model of SUMMARY_MODELS) {
    try {
      const data = await callGeminiModel(model, body, apiKey);
      const text = extractTextFromGeminiResponse(data);

      if (text) {
        return { text, model };
      }

      lastError = new Error(`Gemini model ${model} returned an empty response.`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('All Gemini models failed.');
}

async function summarizeTranscript(transcriptText, apiKey) {
  const chunks = splitTranscriptIntoChunks(transcriptText);

  if (chunks.length === 1) {
    return generateWithFallback({
      contents: [{
        parts: [{
          text: buildLessonSummaryPrompt(transcriptText),
        }],
      }],
    }, apiKey);
  }

  const chunkSummaries = [];
  for (const [index, chunk] of chunks.entries()) {
    const { text } = await generateWithFallback({
      contents: [{
        parts: [{
          text: buildChunkPrompt(chunk, index + 1, chunks.length),
        }],
      }],
    }, apiKey);
    chunkSummaries.push(text);
  }

  return generateWithFallback({
    contents: [{
      parts: [{
        text: buildCombinedPrompt(chunkSummaries),
      }],
    }],
  }, apiKey);
}

export async function POST(req) {
  try {
    const { transcriptText } = await req.json();

    if (!transcriptText || !transcriptText.trim()) {
      return NextResponse.json({ error: 'transcriptText is required' }, { status: 400 });
    }

    const apiKey = getGeminiApiKey();
    const { text, model } = await summarizeTranscript(transcriptText.trim(), apiKey);

    return NextResponse.json({
      summary: text,
      model,
    });
  } catch (error) {
    console.error('Summarization route error:', error);

    return NextResponse.json(
      { error: error.message || 'Failed to summarize transcript.' },
      { status: error.status || 500 },
    );
  }
}
