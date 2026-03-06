/**
 * Maps each book category to the genres available in that category.
 * Genre values match BOOK_GENRES in books.ts.
 */

export const CATEGORY_GENRES: Record<string, string[]> = {
  reading:      ['fiction', 'mystery', 'romance', 'sci-fi', 'fantasy', 'horror', 'historical', 'adventure', 'young-adult', 'biography', 'poetry', 'humor', 'comics'],
  study:        ['psychology', 'philosophy', 'history', 'science', 'business', 'health', 'self-help', 'biography'],
  children:     ['children', 'young-adult', 'humor', 'adventure', 'fantasy'],
  professional: ['business', 'psychology', 'philosophy', 'science', 'health', 'cooking', 'art'],
  reference:    ['history', 'science', 'philosophy', 'religion', 'travel', 'art', 'biography'],
  magazines:    ['comics', 'humor', 'art', 'travel', 'cooking'],
};

/** City GPS coordinates for the Supabase `location_lat / location_lng` columns */
export const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  'תל אביב':             { lat: 32.0853,  lng: 34.7818  },
  'ירושלים':             { lat: 31.7683,  lng: 35.2137  },
  'חיפה':                { lat: 32.7940,  lng: 34.9896  },
  'באר שבע':             { lat: 31.2518,  lng: 34.7915  },
  'ראשון לציון':         { lat: 31.9730,  lng: 34.7925  },
  'פתח תקווה':           { lat: 32.0878,  lng: 34.8878  },
  'נתניה':               { lat: 32.3329,  lng: 34.8600  },
  'אשדוד':               { lat: 31.7969,  lng: 34.6496  },
  'חולון':               { lat: 32.0108,  lng: 34.7799  },
  'בני ברק':             { lat: 32.0840,  lng: 34.8340  },
  'רמת גן':              { lat: 32.0680,  lng: 34.8236  },
  'אשקלון':              { lat: 31.6688,  lng: 34.5743  },
  'רחובות':              { lat: 31.8928,  lng: 34.8113  },
  'בת ים':               { lat: 32.0232,  lng: 34.7499  },
  'כפר סבא':             { lat: 32.1752,  lng: 34.9069  },
  'הרצליה':              { lat: 32.1641,  lng: 34.8444  },
  'חדרה':                { lat: 32.4338,  lng: 34.9191  },
  'מודיעין-מכבים-רעות':  { lat: 31.8928,  lng: 35.0095  },
  'נהריה':               { lat: 33.0043,  lng: 35.0949  },
  'לוד':                 { lat: 31.9521,  lng: 34.8954  },
  'רמלה':                { lat: 31.9292,  lng: 34.8700  },
  'נס ציונה':            { lat: 31.9299,  lng: 34.7993  },
  'ראש העין':            { lat: 32.0957,  lng: 34.9571  },
  'אילת':                { lat: 29.5581,  lng: 34.9482  },
  'טבריה':               { lat: 32.7942,  lng: 35.5311  },
  'נצרת':                { lat: 32.6996,  lng: 35.3035  },
  'עכו':                 { lat: 32.9228,  lng: 35.0701  },
};
