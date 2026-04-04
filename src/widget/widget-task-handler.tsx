import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { BookWidget } from './BookWidget';
import { BookGridWidget } from './BookGridWidget';
import type { WidgetBook } from './BookWidget';

// Hardcoded because process.env is not available in the widget headless task
const SUPABASE_URL = 'https://zivyfdflfiaiojpoqhlb.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppdnlmZGZsZmlhaW9qcG9xaGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNzg1NDYsImV4cCI6MjA4Mjk1NDU0Nn0.IexOFbqcH529GuNhWuV4yTUXDyjGgVwmXjkBZU4QaaE';

// Separate cache keys per widget type so they never interfere with each other
const CACHE_KEY_FULL = '@bookloop_widget_cache_full';
const CACHE_KEY_GRID = '@bookloop_widget_cache_grid';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

interface CacheEntry {
  books: WidgetBook[];
  ts: number;
}

// ── Module-level memory cache ─────────────────────────────────────────────
// Survives across WIDGET_ADDED → WIDGET_RESIZED within the same headless
// task process. Eliminates the async AsyncStorage read on resize, making
// re-renders synchronous and instant (no stretch/lag).
let memCacheFull: WidgetBook[] | null = null;
let memCacheGrid: WidgetBook[] | null = null;

function getMemCache(isGallery: boolean): WidgetBook[] | null {
  return isGallery ? memCacheGrid : memCacheFull;
}

function setMemCache(isGallery: boolean, books: WidgetBook[]) {
  if (isGallery) {
    memCacheGrid = books;
  } else {
    memCacheFull = books;
  }
}

async function readCache(isGallery: boolean): Promise<CacheEntry | null> {
  try {
    const key = isGallery ? CACHE_KEY_GRID : CACHE_KEY_FULL;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    // Also populate memory cache so future resizes are instant
    setMemCache(isGallery, entry.books);
    return entry;
  } catch {
    return null;
  }
}

async function writeCache(isGallery: boolean, books: WidgetBook[]): Promise<void> {
  setMemCache(isGallery, books);
  try {
    const key = isGallery ? CACHE_KEY_GRID : CACHE_KEY_FULL;
    await AsyncStorage.setItem(key, JSON.stringify({ books, ts: Date.now() }));
  } catch {}
}

async function fetchBooks(): Promise<WidgetBook[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/books?status=eq.active&order=created_at.desc&limit=10&select=id,title,author,price,listing_type,city,images`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      signal: controller.signal,
    },
  );
  clearTimeout(timeout);
  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map((book: any) => ({
    id: book.id || '',
    title: book.title || '',
    author: book.author || '',
    price: book.price ? String(book.price) : '',
    listingType: book.listing_type || 'sale',
    city: book.city || '',
    imageUrl:
      book.images && book.images.length > 0 && book.images[0]?.startsWith('https')
        ? `${book.images[0]}?width=300&height=400&resize=cover`
        : '',
  }));
}

// ── Layout helpers ────────────────────────────────────────────────────────

/** Width < 120dp = single tiny cell — show minimalist single-cover view */
function isMinimalistSize(widthDp: number): boolean {
  return widthDp < 120;
}

/**
 * Snap-to-column breakpoints based on real Android cell sizes (~73dp/cell).
 *
 *  1 cell  (~73dp)  → minimalist (handled separately)
 *  2 cells (~146dp) → 1 column — one comfortable book per row
 *  3 cells (~219dp) → 2 columns — compact pair per row
 *  4 cells (~292dp) → 2 columns — spacious pair per row
 *  5+ cells(~365dp) → 2 columns — wide spacious pair
 *
 * Never returns a value that produces half-books. Books always fill
 * their column via flex: 1.
 */
function getColumns(widthDp: number): number {
  if (widthDp < 200) return 1;
  return 2;
}

function getGalleryImageSize(widthDp: number, columns: number) {
  const totalSpacing = 12 + (columns - 1) * 6;
  const imgWidth = Math.floor((widthDp - totalSpacing) / columns);
  const imgHeight = Math.floor(imgWidth * 1.4);
  return { imgWidth, imgHeight };
}

/** Calculate card image size for the full (BookWidget) grid.
 *  Caps image height so at least 2 full card rows always fit within the widget. */
function getCardImageSize(widthDp: number, heightDp: number, columns: number) {
  // Width-based image width
  const totalHSpacing = columns === 1 ? 16 : 24; // outer padding + inter-column gap
  const imgWidth = Math.floor((widthDp - totalHSpacing) / columns);

  // Ideal height at 3:4 ratio
  let imgHeight = Math.floor(imgWidth * 1.33);

  // Height budget: subtract header (37dp), row gap (8dp), text area per card (48dp), top padding (8dp)
  // Divide by 2 rows to get max image height per card
  const headerH = 37;
  const rowGap = 8;
  const textAreaH = 48;
  const paddingV = 8;
  const maxImgHeight = Math.floor((heightDp - headerH - paddingV - rowGap) / 2) - textAreaH;

  if (maxImgHeight > 40 && imgHeight > maxImgHeight) {
    imgHeight = maxImgHeight;
  }

  return { imgWidth, imgHeight };
}

// ── Render helper ─────────────────────────────────────────────────────────

function renderWidget(
  isGallery: boolean,
  books: WidgetBook[],
  columns: number,
  imgWidth: number,
  imgHeight: number,
  cardImgWidth: number,
  cardImgHeight: number,
  listHeight: number,
  isLoading: boolean,
  isMinimalist: boolean,
  renderFn: (w: any) => void,
) {
  if (isGallery) {
    renderFn(
      <BookGridWidget
        books={books}
        columns={columns}
        imgWidth={imgWidth}
        imgHeight={imgHeight}
        isLoading={isLoading}
        isMinimalist={isMinimalist}
      />,
    );
  } else {
    renderFn(
      <BookWidget
        books={books}
        columns={columns}
        imgWidth={cardImgWidth}
        imgHeight={cardImgHeight}
        listHeight={listHeight}
        isLoading={isLoading}
        isMinimalist={isMinimalist}
      />,
    );
  }
}

/** Compute all layout values from widget dimensions */
function computeLayout(width: number, height: number) {
  const columns = getColumns(width);
  const isMinimalist = isMinimalistSize(width);
  const { imgWidth, imgHeight } = getGalleryImageSize(width, columns);
  const { imgWidth: cardImgWidth, imgHeight: cardImgHeight } = getCardImageSize(width, height, columns);
  const listHeight = Math.max(height - 37, 80);
  return { columns, isMinimalist, imgWidth, imgHeight, cardImgWidth, cardImgHeight, listHeight };
}

// ── Main handler ──────────────────────────────────────────────────────────

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const { widgetAction, widgetInfo } = props;

  switch (widgetAction) {
    // ── RESIZE: synchronous, instant, no fetch ──────────────────────────
    case 'WIDGET_RESIZED': {
      const { width, height } = widgetInfo;
      const isGallery = widgetInfo.widgetName === 'BookLoopGrid';
      const layout = computeLayout(width, height);

      // Use in-memory cache for instant render — no async gap, no stretch
      const mem = getMemCache(isGallery);
      if (mem) {
        renderWidget(
          isGallery, mem, layout.columns, layout.imgWidth, layout.imgHeight,
          layout.cardImgWidth, layout.cardImgHeight, layout.listHeight,
          false, layout.isMinimalist, props.renderWidget,
        );
      } else {
        // Memory cache miss — render skeleton first, then try disk cache, then fetch.
        renderWidget(
          isGallery, [], layout.columns, layout.imgWidth, layout.imgHeight,
          layout.cardImgWidth, layout.cardImgHeight, layout.listHeight,
          true, layout.isMinimalist, props.renderWidget,
        );
        const cache = await readCache(isGallery);
        if (cache) {
          renderWidget(
            isGallery, cache.books, layout.columns, layout.imgWidth, layout.imgHeight,
            layout.cardImgWidth, layout.cardImgHeight, layout.listHeight,
            false, layout.isMinimalist, props.renderWidget,
          );
        } else {
          // No disk cache either (race vs WIDGET_ADDED) — fetch so widget never stays stuck
          try {
            const books = await fetchBooks();
            await writeCache(isGallery, books);
            renderWidget(
              isGallery, books, layout.columns, layout.imgWidth, layout.imgHeight,
              layout.cardImgWidth, layout.cardImgHeight, layout.listHeight,
              false, layout.isMinimalist, props.renderWidget,
            );
          } catch {
            renderWidget(
              isGallery, [], layout.columns, layout.imgWidth, layout.imgHeight,
              layout.cardImgWidth, layout.cardImgHeight, layout.listHeight,
              false, layout.isMinimalist, props.renderWidget,
            );
          }
        }
      }
      break;
    }

    // ── ADDED: render skeleton immediately, then cache, then fetch ───────
    case 'WIDGET_ADDED': {
      const { width, height } = widgetInfo;
      const isGallery = widgetInfo.widgetName === 'BookLoopGrid';
      const layout = computeLayout(width, height);

      // Step 1: Render skeleton IMMEDIATELY — widget is visible from frame 1
      renderWidget(
        isGallery, [], layout.columns, layout.imgWidth, layout.imgHeight,
        layout.cardImgWidth, layout.cardImgHeight, layout.listHeight,
        true, layout.isMinimalist, props.renderWidget,
      );

      // Step 2: Check cache — if we have data, render it (fast swap from skeleton to real)
      const cache = await readCache(isGallery);
      if (cache) {
        renderWidget(
          isGallery, cache.books, layout.columns, layout.imgWidth, layout.imgHeight,
          layout.cardImgWidth, layout.cardImgHeight, layout.listHeight,
          false, layout.isMinimalist, props.renderWidget,
        );
      }

      // Step 3: Always fetch fresh data on first add
      try {
        const books = await fetchBooks();
        await writeCache(isGallery, books);
        renderWidget(
          isGallery, books, layout.columns, layout.imgWidth, layout.imgHeight,
          layout.cardImgWidth, layout.cardImgHeight, layout.listHeight,
          false, layout.isMinimalist, props.renderWidget,
        );
      } catch {
        if (!cache) {
          renderWidget(
            isGallery, [], layout.columns, layout.imgWidth, layout.imgHeight,
            layout.cardImgWidth, layout.cardImgHeight, layout.listHeight,
            false, layout.isMinimalist, props.renderWidget,
          );
        }
      }
      break;
    }

    // ── UPDATE: render from cache, skip fetch if cache is fresh ──────────
    case 'WIDGET_UPDATE': {
      const { width, height } = widgetInfo;
      const isGallery = widgetInfo.widgetName === 'BookLoopGrid';
      const layout = computeLayout(width, height);

      // Try memory cache first for instant render
      const mem = getMemCache(isGallery);
      if (mem) {
        renderWidget(
          isGallery, mem, layout.columns, layout.imgWidth, layout.imgHeight,
          layout.cardImgWidth, layout.cardImgHeight, layout.listHeight,
          false, layout.isMinimalist, props.renderWidget,
        );
      }

      const cache = await readCache(isGallery);
      if (cache) {
        // Re-render with persisted cache (may be same as mem, that's fine)
        renderWidget(
          isGallery, cache.books, layout.columns, layout.imgWidth, layout.imgHeight,
          layout.cardImgWidth, layout.cardImgHeight, layout.listHeight,
          false, layout.isMinimalist, props.renderWidget,
        );
        // If cache is fresh enough, don't hit the network
        if (Date.now() - cache.ts < CACHE_TTL) {
          break;
        }
      } else if (!mem) {
        // No cache at all — show skeleton
        renderWidget(
          isGallery, [], layout.columns, layout.imgWidth, layout.imgHeight,
          layout.cardImgWidth, layout.cardImgHeight, layout.listHeight,
          true, layout.isMinimalist, props.renderWidget,
        );
      }

      // Fetch fresh data
      try {
        const books = await fetchBooks();
        await writeCache(isGallery, books);
        renderWidget(
          isGallery, books, layout.columns, layout.imgWidth, layout.imgHeight,
          layout.cardImgWidth, layout.cardImgHeight, layout.listHeight,
          false, layout.isMinimalist, props.renderWidget,
        );
      } catch {
        if (!cache && !mem) {
          renderWidget(
            isGallery, [], layout.columns, layout.imgWidth, layout.imgHeight,
            layout.cardImgWidth, layout.cardImgHeight, layout.listHeight,
            false, layout.isMinimalist, props.renderWidget,
          );
        }
      }
      break;
    }

    case 'WIDGET_DELETED':
      break;
    case 'WIDGET_CLICK':
      break;
    default:
      break;
  }
}
