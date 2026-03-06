/**
 * AI Book Detection — Gemini 2.0 Flash (Vision)
 * Supports:
 *   - analyzeBookPhoto:   single book cover → title/author/genres/condition
 *   - detectBooksInPhoto: one photo of many books → array with bounding boxes
 */

import * as ImageManipulator from 'expo-image-manipulator';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BookDetectionResult {
  title: string;
  author: string;
  confidence: number;
  estimatedCondition: 'new' | 'like_new' | 'good' | 'fair' | null;
  detectedGenres: string[];
  description: string | null;
  language: 'hebrew' | 'english' | 'other';
  imageUri: string;
}

export interface BatchBookResult {
  title: string;
  author: string;
  confidence: number;
  estimatedCondition: 'new' | 'like_new' | 'good' | 'fair' | null;
  detectedGenres: string[];
  description: string | null;
  /** Normalised 0–1 bounding box in the source image */
  boundingBox: { x: number; y: number; width: number; height: number };
}

export interface AIAnalysisError {
  success: false;
  error: string;
  code: 'NO_API_KEY' | 'INVALID_IMAGE' | 'API_ERROR' | 'NO_BOOK_DETECTED' | 'PARSE_ERROR' | 'RATE_LIMITED';
}
export interface AIAnalysisSuccess   { success: true; data: BookDetectionResult; }
export interface BatchAnalysisSuccess { success: true; books: BatchBookResult[]; }

export type AIAnalysisResult   = AIAnalysisSuccess   | AIAnalysisError;
export type BatchAnalysisResult = BatchAnalysisSuccess | AIAnalysisError;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function uriToBase64(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1024 } }],
    { base64: true, compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
  );
  if (!result.base64) throw new Error('Failed to convert image to base64');
  return result.base64;
}

async function callGemini(base64: string, prompt: string): Promise<string> {
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: 'image/jpeg', data: base64 } },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
    }),
  });

  if (res.status === 429) throw Object.assign(new Error('Rate limited'), { code: 'RATE_LIMITED' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini error ${res.status}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── Single book ───────────────────────────────────────────────────────────────

function parseSingleBook(text: string, imageUri: string): BookDetectionResult {
  const cleaned = text.trim().replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  const match   = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object in AI response');

  const p = JSON.parse(match[0]);

  let title  = (p.title  || 'Unknown Title').trim().replace(/^(Title:|Book:)\s*/i, '');
  let author = (p.author || 'Unknown Author').trim().replace(/^(By:|Author:|Written by:|מאת:?)\s*/i, '');
  if (!author || author.toLowerCase().includes('unknown')) author = 'Unknown Author';

  let confidence = typeof p.confidence === 'number' ? p.confidence : 0.7;
  if (confidence > 1) confidence /= 100;
  confidence = Math.min(1, Math.max(0, confidence));

  const validConditions = ['new', 'like_new', 'good', 'fair'];
  const validLangs      = ['hebrew', 'english', 'other'];

  return {
    title,
    author,
    confidence,
    estimatedCondition: validConditions.includes(p.condition) ? p.condition : null,
    detectedGenres:     Array.isArray(p.genres) ? (p.genres as string[]).slice(0, 3) : [],
    description:        p.description || null,
    language:           validLangs.includes(p.language) ? p.language : 'other',
    imageUri,
  } as BookDetectionResult;
}

export async function analyzeBookPhoto(imageUri: string): Promise<AIAnalysisResult> {
  if (!GEMINI_API_KEY) {
    return { success: false, error: 'Gemini API key not configured. Add EXPO_PUBLIC_GEMINI_API_KEY to .env', code: 'NO_API_KEY' };
  }

  try {
    const base64 = await uriToBase64(imageUri);
    const prompt  = `You are an expert book identifier. Analyze this book cover carefully.
INSTRUCTIONS:
- Read ALL text on the cover precisely
- Preserve the original language (Hebrew / English) for title and author — do NOT translate them
- description: Write 1-2 sentences about the BOOK'S STORY OR CONTENT (not what you see on the cover). Write it IN HEBREW. If you don't know the book, write null.

Return ONLY valid JSON (no markdown):
{
  "title": "EXACT title as on cover",
  "author": "EXACT author as on cover",
  "confidence": 0.95,
  "condition": "good",
  "genres": ["romance", "thriller"],
  "description": "תיאור הספר בעברית",
  "language": "hebrew"
}
condition: new|like_new|good|fair
language: hebrew|english|other
genres: 1-3 values ONLY from this exact list:
romance, thriller, mystery, literary_fiction, fantasy, drama, historical_fiction,
biography_memoir, crime_detective, adventure, science_fiction, teen_fiction,
teen_fantasy, short_stories, horror, fiction, self_improvement, health_wellness,
picture_books, educational_kids, graphic_novel_comics, teen_romance, comics_kids,
poetry, cooking_baking, business_management, psychology, philosophy, religion,
art_design, travel_writing, humor, children, history, science, travel`;

    const text   = await callGemini(base64, prompt);
    const result = parseSingleBook(text, imageUri);

    if (result.confidence < 0.3) {
      return { success: false, error: 'Could not clearly identify the book. Try a clearer photo.', code: 'NO_BOOK_DETECTED' };
    }

    return { success: true, data: result };
  } catch (err: any) {
    if (err.code === 'RATE_LIMITED') {
      return { success: false, error: 'AI rate limit reached (15 req/min). Wait a moment and try again.', code: 'RATE_LIMITED' };
    }
    return { success: false, error: err.message || 'Failed to analyze image', code: 'PARSE_ERROR' };
  }
}

// ── Batch detection ───────────────────────────────────────────────────────────

function parseBatchBooks(text: string): BatchBookResult[] {
  // Greedy regex captures the full JSON array even across newlines
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array in batch AI response');

  const arr = JSON.parse(match[0]) as any[];
  const validConditions = ['new', 'like_new', 'good', 'fair'];

  return arr
    .filter(item => item && typeof item === 'object')
    .map(item => {
      let conf = typeof item.confidence === 'number' ? item.confidence : 0.6;
      if (conf > 1) conf /= 100;
      conf = Math.min(1, Math.max(0, conf));

      const bb = item.boundingBox ?? item.bounding_box ?? {};
      const clamp = (v: any) => typeof v === 'number' ? Math.min(1, Math.max(0, v)) : 0;

      return {
        title:             (item.title  || 'Unknown Title').trim(),
        author:            (item.author || 'Unknown Author').trim(),
        confidence:        conf,
        estimatedCondition: validConditions.includes(item.condition) ? item.condition : null,
        detectedGenres:    Array.isArray(item.genres) ? (item.genres as string[]).slice(0, 3) : [],
        description:       item.description || null,
        boundingBox: {
          x:      clamp(bb.x),
          y:      clamp(bb.y),
          width:  clamp(bb.width)  || 1,
          height: clamp(bb.height) || 1,
        },
      } satisfies BatchBookResult;
    });
}

export async function detectBooksInPhoto(imageUri: string): Promise<BatchAnalysisResult> {
  if (!GEMINI_API_KEY) {
    return { success: false, error: 'Gemini API key not configured. Add EXPO_PUBLIC_GEMINI_API_KEY to .env', code: 'NO_API_KEY' };
  }

  try {
    const base64 = await uriToBase64(imageUri);
    const prompt  = `You are an expert book detector. Identify EVERY book visible in this image.

For EACH book return an object with its bounding box (normalised 0-1, origin at top-left).

Return ONLY a valid JSON ARRAY (no markdown, no backticks):
[
  {
    "title": "exact title",
    "author": "exact author",
    "confidence": 0.9,
    "condition": "good",
    "genres": ["fiction"],
    "description": "תיאור הספר בעברית",
    "boundingBox": { "x": 0.05, "y": 0.1, "width": 0.2, "height": 0.7 }
  }
]

Rules:
- boundingBox: fractions of full image dimensions (0.0 – 1.0)
- condition: new|like_new|good|fair
- description: Write 1-2 sentences about the BOOK'S STORY OR CONTENT in HEBREW. Write null if unknown.
- genres: 1-3 values ONLY from this exact list:
  romance, thriller, mystery, literary_fiction, fantasy, drama, historical_fiction,
  biography_memoir, crime_detective, adventure, science_fiction, teen_fiction,
  teen_fantasy, short_stories, horror, fiction, self_improvement, health_wellness,
  picture_books, educational_kids, graphic_novel_comics, teen_romance, comics_kids,
  poetry, cooking_baking, business_management, psychology, philosophy, religion,
  art_design, travel_writing, humor, children, history, science, travel
- Preserve original language for title/author
- Return [] if no books found`;

    const text  = await callGemini(base64, prompt);
    const books = parseBatchBooks(text);

    if (books.length === 0) {
      return { success: false, error: 'No books detected. Try a clearer photo.', code: 'NO_BOOK_DETECTED' };
    }
    return { success: true, books };
  } catch (err: any) {
    if (err.code === 'RATE_LIMITED') {
      return { success: false, error: 'AI rate limit reached (15 req/min). Wait a moment and try again.', code: 'RATE_LIMITED' };
    }
    return { success: false, error: err.message || 'Failed to detect books', code: 'PARSE_ERROR' };
  }
}
