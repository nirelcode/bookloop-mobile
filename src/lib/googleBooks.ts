/**
 * Google Books API — ISBN lookup + book search
 * Maps Google subjects → our internal genre keys
 */

const GOOGLE_BOOKS_KEY = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY || '';
const BASE = 'https://www.googleapis.com/books/v1/volumes';

export interface GoogleBookResult {
  title: string;
  author: string;
  description?: string;
  genres: string[];
  thumbnail?: string;
  isbn?: string;
}

// Google Books category strings → our genre values
const SUBJECT_MAP: Record<string, string> = {
  'fiction':            'fiction',
  'mystery':            'mystery',
  'thriller':           'mystery',
  'crime':              'mystery',
  'romance':            'romance',
  'science fiction':    'sci-fi',
  'fantasy':            'fantasy',
  'horror':             'horror',
  'history':            'history',
  'historical fiction': 'historical',
  'adventure':          'adventure',
  'biography':          'biography',
  'autobiography':      'biography',
  'self-help':          'self-help',
  'personal development':'self-help',
  'business':           'business',
  'economics':          'business',
  'psychology':         'psychology',
  'philosophy':         'philosophy',
  'science':            'science',
  'nature':             'science',
  'health':             'health',
  'cooking':            'cooking',
  'food':               'cooking',
  'art':                'art',
  'photography':        'art',
  'travel':             'travel',
  'religion':           'religion',
  'spirituality':       'religion',
  'poetry':             'poetry',
  'humor':              'humor',
  'comics':             'comics',
  "children's":         'children',
  'juvenile':           'children',
  'young adult':        'young-adult',
};

function mapCategories(categories: string[]): string[] {
  const genres: string[] = [];
  for (const cat of categories) {
    const lower = cat.toLowerCase();
    for (const [key, value] of Object.entries(SUBJECT_MAP)) {
      if (lower.includes(key) && !genres.includes(value)) {
        genres.push(value);
        if (genres.length >= 3) return genres;
      }
    }
  }
  return genres;
}

function parseVolume(volume: any): GoogleBookResult {
  const info = volume?.volumeInfo ?? {};
  const isbn = (info.industryIdentifiers as any[] | undefined)?.find(
    (id) => id.type === 'ISBN_13' || id.type === 'ISBN_10'
  )?.identifier;

  return {
    title:       info.title ?? '',
    author:      ((info.authors ?? []) as string[]).join(', '),
    description: info.description,
    genres:      mapCategories((info.categories ?? []) as string[]),
    thumbnail:   info.imageLinks?.thumbnail?.replace('http:', 'https:'),
    isbn,
  };
}

function buildUrl(query: string): string {
  const key = GOOGLE_BOOKS_KEY ? `&key=${GOOGLE_BOOKS_KEY}` : '';
  return `${BASE}?q=${query}&maxResults=1${key}`;
}

export async function lookupByISBN(isbn: string): Promise<GoogleBookResult | null> {
  try {
    const res  = await fetch(buildUrl(`isbn:${isbn}`));
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.items?.length) return null;
    return parseVolume(data.items[0]);
  } catch {
    return null;
  }
}

export async function searchByTitleAuthor(title: string, author?: string): Promise<GoogleBookResult | null> {
  try {
    const parts = [
      title  ? `intitle:${encodeURIComponent(title)}`  : '',
      author ? `inauthor:${encodeURIComponent(author)}` : '',
    ].filter(Boolean).join('+');

    const res  = await fetch(buildUrl(parts));
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.items?.length) return null;
    return parseVolume(data.items[0]);
  } catch {
    return null;
  }
}
