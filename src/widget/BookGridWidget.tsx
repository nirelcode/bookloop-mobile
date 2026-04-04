import React from 'react';
import {
  FlexWidget,
  ImageWidget,
  ListWidget,
  TextWidget,
} from 'react-native-android-widget';
import type { WidgetBook } from './BookWidget';

const C = {
  primary: '#2563eb' as const,
  emerald: '#059669' as const,
  amber: '#d97706' as const,
  white: '#ffffff' as const,
  transparent: '#00000000' as const,
  priceBg: '#000000bb' as const,
  placeholder: '#e7e5e4' as const,
  placeholderText: '#a8a29e' as const,
  skeleton: '#d6d3d1' as const,
  pillBg: '#ffffffee' as const,
};

// ── Frosted pill "See more" button — matches the logo pill style ──────────
function SeeMorePill() {
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        paddingVertical: 10,
        paddingHorizontal: 12,
        alignItems: 'center',
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'bookloop://catalog' }}
    >
      <FlexWidget
        style={{
          backgroundColor: C.pillBg,
          borderRadius: 20,
          paddingHorizontal: 20,
          paddingVertical: 7,
        }}
      >
        <TextWidget
          text="עוד ספרים  ←"
          style={{ fontSize: 12, fontWeight: '600', color: C.primary }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

function priceColor(type: string) {
  if (type === 'free') return C.emerald;
  if (type === 'trade') return C.amber;
  return C.white;
}

function priceLabel(price: string, type: string) {
  if (type === 'free') return 'חינם';
  if (type === 'trade') return 'להחלפה';
  return price ? `₪${price}` : '';
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

// ── Single gallery cover with price overlay ───────────────────────────────
function GalleryCover({
  book,
  imgWidth,
  imgHeight,
}: {
  book: WidgetBook;
  imgWidth: number;
  imgHeight: number;
}) {
  const hasImage = book.imageUrl.length > 0;
  const label = priceLabel(book.price, book.listingType);

  return (
    <FlexWidget
      style={{ flex: 1, marginHorizontal: 3 }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: `bookloop://book/${book.id}` }}
    >
      <OverlapWidget
        style={{
          width: 'match_parent',
          height: imgHeight,
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        {/* Book cover image */}
        {hasImage ? (
          <ImageWidget
            image={book.imageUrl as `https:${string}`}
            imageWidth={imgWidth}
            imageHeight={imgHeight}
            radius={16}
          />
        ) : (
          <FlexWidget
            style={{
              width: 'match_parent',
              height: imgHeight,
              borderRadius: 16,
              backgroundColor: C.placeholder,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <TextWidget
              text="B"
              style={{ fontSize: 32, fontWeight: '700', color: C.placeholderText }}
            />
          </FlexWidget>
        )}

        {/* Price badge overlay — bottom right */}
        {label.length > 0 && (
          <FlexWidget
            style={{
              width: 'match_parent',
              height: 'match_parent',
              justifyContent: 'flex-end',
              alignItems: 'flex-end',
              padding: 6,
            }}
          >
            <FlexWidget
              style={{
                backgroundColor: C.priceBg,
                borderRadius: 6,
                paddingHorizontal: 7,
                paddingVertical: 3,
              }}
            >
              <TextWidget
                text={label}
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: priceColor(book.listingType),
                }}
              />
            </FlexWidget>
          </FlexWidget>
        )}
      </OverlapWidget>
    </FlexWidget>
  );
}

// ── Skeleton placeholder for loading state (transparent bg, no text) ──────
function SkeletonGalleryCover({ imgHeight }: { imgHeight: number }) {
  return (
    <FlexWidget style={{ flex: 1, marginHorizontal: 3 }}>
      <FlexWidget
        style={{
          width: 'match_parent',
          height: imgHeight,
          borderRadius: 16,
          backgroundColor: C.skeleton,
        }}
      />
    </FlexWidget>
  );
}

function EmptySlot() {
  return <FlexWidget style={{ flex: 1, marginHorizontal: 3 }} />;
}

// ── Minimalist view: single book cover, full widget, no text ──────────────
function MinimalistGalleryView({
  book,
  isLoading,
}: {
  book?: WidgetBook;
  isLoading: boolean;
}) {
  if (isLoading || !book) {
    return (
      <FlexWidget
        style={{
          flex: 1,
          width: 'match_parent',
          height: 'match_parent',
          borderRadius: 16,
          backgroundColor: C.skeleton,
        }}
        clickAction="OPEN_APP"
      />
    );
  }

  if (book.imageUrl) {
    return (
      <FlexWidget
        style={{
          flex: 1,
          width: 'match_parent',
          height: 'match_parent',
          borderRadius: 16,
          overflow: 'hidden',
        }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: `bookloop://book/${book.id}` }}
      >
        <ImageWidget
          image={book.imageUrl as `https:${string}`}
          imageWidth={200}
          imageHeight={200}
          radius={16}
        />
      </FlexWidget>
    );
  }

  // No image — show a subtle placeholder square
  return (
    <FlexWidget
      style={{
        flex: 1,
        width: 'match_parent',
        height: 'match_parent',
        borderRadius: 16,
        backgroundColor: C.placeholder,
        justifyContent: 'center',
        alignItems: 'center',
      }}
      clickAction="OPEN_APP"
    >
      <TextWidget
        text="B"
        style={{ fontSize: 32, fontWeight: '700', color: C.placeholderText }}
      />
    </FlexWidget>
  );
}

/**
 * Widget 2 — Gallery widget. Just book cover images with price overlay.
 * No background, no text outside images. Scrollable.
 */
export function BookGridWidget({
  books,
  columns,
  imgWidth,
  imgHeight,
  isLoading,
  isMinimalist,
}: {
  books: WidgetBook[];
  columns: number;
  imgWidth: number;
  imgHeight: number;
  isLoading: boolean;
  isMinimalist: boolean;
}) {
  // Tiny widget: single cover, no text, transparent bg
  if (isMinimalist) {
    return <MinimalistGalleryView book={books[0]} isLoading={isLoading} />;
  }

  const hasBooks = books.length > 0;
  const rows = chunk(books, columns);

  // Empty state
  if (!isLoading && !hasBooks) {
    return (
      <FlexWidget
        style={{
          height: 'match_parent',
          width: 'match_parent',
          backgroundColor: C.transparent,
          flexDirection: 'column',
          paddingHorizontal: 8,
          paddingTop: 6,
        }}
        clickAction="OPEN_APP"
      >
        <FlexWidget
          style={{
            backgroundColor: '#ffffffee',
            borderRadius: 20,
            paddingHorizontal: 10,
            paddingVertical: 5,
            alignItems: 'center',
          }}
        >
          <ImageWidget
            image={require('../../assets/logo.png')}
            imageWidth={68}
            imageHeight={15}
            radius={0}
          />
        </FlexWidget>
        <FlexWidget
          style={{ flex: 1, width: 'match_parent', justifyContent: 'center', alignItems: 'center' }}
        >
          <TextWidget
            text="לחץ לעיון בספרים"
            style={{ fontSize: 13, color: C.placeholderText }}
          />
        </FlexWidget>
      </FlexWidget>
    );
  }

  // Logo pill — first item inside the list (scrolls with content, always visible at top)
  const LogoRow = (
    <FlexWidget
      style={{
        width: 'match_parent',
        paddingHorizontal: 8,
        paddingTop: 6,
        paddingBottom: 4,
      }}
      clickAction="OPEN_APP"
    >
      <FlexWidget
        style={{
          backgroundColor: '#ffffffee',
          borderRadius: 20,
          paddingHorizontal: 10,
          paddingVertical: 5,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <ImageWidget
          image={require('../../assets/logo.png')}
          imageWidth={68}
          imageHeight={15}
          radius={0}
        />
      </FlexWidget>
    </FlexWidget>
  );

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: C.transparent,
      }}
    >
      {isLoading ? (
        <ListWidget style={{ width: 'match_parent', flex: 1 }}>
          {LogoRow}
          <FlexWidget style={{ width: 'match_parent', paddingHorizontal: 10, paddingBottom: 6 }}>
            <TextWidget
              text="טוען ספרים..."
              style={{ fontSize: 11, color: C.placeholderText }}
            />
          </FlexWidget>
          {[[0, 1], [2, 3], [4, 5]].map((_, rowIdx) => (
            <FlexWidget
              key={`skr${rowIdx}`}
              style={{
                width: 'match_parent',
                flexDirection: 'row',
                paddingHorizontal: 6,
                marginBottom: 10,
              }}
            >
              <SkeletonGalleryCover imgHeight={imgHeight} />
              {columns >= 2 && <SkeletonGalleryCover imgHeight={imgHeight} />}
            </FlexWidget>
          ))}
        </ListWidget>
      ) : (
        <ListWidget style={{ width: 'match_parent', flex: 1 }}>
          {LogoRow}
          {rows.map((row, rowIdx) => (
            <FlexWidget
              key={`r${rowIdx}`}
              style={{
                width: 'match_parent',
                flexDirection: 'row',
                paddingHorizontal: 6,
                marginBottom: 10,
              }}
            >
              <GalleryCover book={row[0]} imgWidth={imgWidth} imgHeight={imgHeight} />
              {columns >= 2 ? (
                row.length > 1 ? (
                  <GalleryCover book={row[1]} imgWidth={imgWidth} imgHeight={imgHeight} />
                ) : (
                  <EmptySlot />
                )
              ) : (
                <FlexWidget style={{ width: 0 }} />
              )}
            </FlexWidget>
          ))}
          <SeeMorePill />
        </ListWidget>
      )}
    </FlexWidget>
  );
}
