/**
 * AI Book Detection — calls the `detect-books` Supabase Edge Function.
 * The Gemini API key lives server-side only; the app never sees it.
 */

import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from './supabase';

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
export interface AIAnalysisSuccess    { success: true; data: BookDetectionResult; }
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

async function callEdgeFunction(mode: 'single' | 'batch', base64: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('detect-books', {
    body: { mode, base64 },
  });

  if (error) {
    const code = (error as any).code;
    if (code === 'RATE_LIMITED') throw Object.assign(new Error('Rate limited'), { code: 'RATE_LIMITED' });
    throw new Error(error.message || 'Edge function error');
  }

  if (!data?.success) {
    const code = data?.code;
    if (code === 'RATE_LIMITED') throw Object.assign(new Error('Rate limited'), { code: 'RATE_LIMITED' });
    throw new Error(data?.error || 'Edge function returned failure');
  }

  return data.text as string;
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
  try {
    const base64 = await uriToBase64(imageUri);
    const text   = await callEdgeFunction('single', base64);
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
        title:              (item.title  || 'Unknown Title').trim(),
        author:             (item.author || 'Unknown Author').trim(),
        confidence:         conf,
        estimatedCondition: validConditions.includes(item.condition) ? item.condition : null,
        detectedGenres:     Array.isArray(item.genres) ? (item.genres as string[]).slice(0, 3) : [],
        description:        item.description || null,
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
  try {
    const base64 = await uriToBase64(imageUri);
    const text   = await callEdgeFunction('batch', base64);
    const books  = parseBatchBooks(text);

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
