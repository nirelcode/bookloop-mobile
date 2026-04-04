import React from 'react';
import {
  FlexWidget,
  ImageWidget,
  ListWidget,
  TextWidget,
} from 'react-native-android-widget';

export interface WidgetBook {
  id: string;
  title: string;
  author: string;
  price: string;
  listingType: string;
  city: string;
  imageUrl: string;
}

const C = {
  primary: '#2563eb' as const,
  primaryLight: '#eff6ff' as const,
  emerald: '#059669' as const,
  amber: '#d97706' as const,
  text: '#1c1917' as const,
  sub: '#57534e' as const,
  muted: '#a8a29e' as const,
  bg: '#f5f5f4' as const,
  white: '#ffffff' as const,
  border: '#e7e5e4' as const,
  skeleton: '#e7e5e4' as const,
  skeletonPrice: '#dbeafe' as const,
};

function priceColor(type: string) {
  if (type === 'free') return C.emerald;
  if (type === 'trade') return C.amber;
  return C.primary;
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

// ── Vertical card: image on top (3:4), title + price below ───────────────
function VerticalCard({ book, imgWidth, imgHeight }: { book: WidgetBook; imgWidth: number; imgHeight: number }) {
  const hasImage = book.imageUrl.length > 0;

  return (
    <FlexWidget
      style={{
        flex: 1,
        marginHorizontal: 4,
        backgroundColor: C.white,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: C.border,
        overflow: 'hidden',
        flexDirection: 'column',
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: `bookloop://book/${book.id}` }}
    >
      {hasImage ? (
        <ImageWidget
          image={book.imageUrl as `https:${string}`}
          imageWidth={imgWidth}
          imageHeight={imgHeight}
          radius={0}
        />
      ) : (
        <FlexWidget
          style={{
            width: 'match_parent',
            height: imgHeight,
            backgroundColor: C.primaryLight,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <TextWidget
            text="B"
            style={{ fontSize: 36, fontWeight: '700', color: C.primary }}
          />
        </FlexWidget>
      )}
      <FlexWidget style={{ padding: 8, flexDirection: 'column' }}>
        <TextWidget
          text={book.title}
          style={{ fontSize: 12, fontWeight: '700', color: C.text }}
          maxLines={2}
        />
        <TextWidget
          text={priceLabel(book.price, book.listingType)}
          style={{
            fontSize: 11,
            fontWeight: '600',
            color: priceColor(book.listingType),
            marginTop: 3,
          }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

// ── Skeleton card (loading placeholder, same shape as VerticalCard) ───────
function SkeletonVerticalCard({ imgWidth, imgHeight }: { imgWidth: number; imgHeight: number }) {
  return (
    <FlexWidget
      style={{
        flex: 1,
        marginHorizontal: 4,
        backgroundColor: C.white,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: C.border,
        overflow: 'hidden',
        flexDirection: 'column',
      }}
    >
      <FlexWidget
        style={{ width: 'match_parent', height: imgHeight, backgroundColor: C.skeleton }}
      />
      <FlexWidget style={{ padding: 8, flexDirection: 'column' }}>
        <FlexWidget
          style={{
            width: 'match_parent',
            height: 11,
            backgroundColor: C.skeleton,
            borderRadius: 4,
          }}
        />
        <FlexWidget
          style={{
            width: 48,
            height: 10,
            backgroundColor: C.skeletonPrice,
            borderRadius: 4,
            marginTop: 6,
          }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

// ── WideCard: horizontal layout for single-column narrow widgets ──────────
function WideCard({ book }: { book: WidgetBook }) {
  const hasImage = book.imageUrl.length > 0;

  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        flexDirection: 'row',
        backgroundColor: C.white,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.border,
        padding: 10,
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: `bookloop://book/${book.id}` }}
    >
      {hasImage ? (
        <ImageWidget
          image={book.imageUrl as `https:${string}`}
          imageWidth={48}
          imageHeight={68}
          radius={6}
        />
      ) : (
        <FlexWidget
          style={{
            width: 48,
            height: 68,
            borderRadius: 6,
            backgroundColor: C.primaryLight,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <TextWidget
            text="B"
            style={{ fontSize: 22, fontWeight: '700', color: C.primary }}
          />
        </FlexWidget>
      )}
      <FlexWidget
        style={{
          flex: 1,
          marginLeft: 10,
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <TextWidget
          text={book.title}
          style={{ fontSize: 14, fontWeight: '600', color: C.text }}
          maxLines={1}
        />
        <TextWidget
          text={book.author}
          style={{ fontSize: 11, color: C.sub, marginTop: 2 }}
          maxLines={1}
        />
        <TextWidget
          text={priceLabel(book.price, book.listingType)}
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: priceColor(book.listingType),
            marginTop: 5,
          }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

// ── Skeleton for WideCard ─────────────────────────────────────────────────
function SkeletonWideCard() {
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        flexDirection: 'row',
        backgroundColor: C.white,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.border,
        padding: 10,
      }}
    >
      <FlexWidget
        style={{
          width: 48,
          height: 68,
          borderRadius: 6,
          backgroundColor: C.skeleton,
        }}
      />
      <FlexWidget
        style={{ flex: 1, marginLeft: 10, flexDirection: 'column', justifyContent: 'center' }}
      >
        <FlexWidget
          style={{ width: 'match_parent', height: 12, backgroundColor: C.skeleton, borderRadius: 4 }}
        />
        <FlexWidget
          style={{ width: 80, height: 10, backgroundColor: C.skeleton, borderRadius: 4, marginTop: 6 }}
        />
        <FlexWidget
          style={{ width: 44, height: 10, backgroundColor: C.skeletonPrice, borderRadius: 4, marginTop: 8 }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

// ── Empty slot (fills space in incomplete rows) ───────────────────────────
function EmptySlot() {
  return <FlexWidget style={{ flex: 1, marginHorizontal: 4 }} />;
}

// ── See more link ─────────────────────────────────────────────────────────
export function SeeMoreLink() {
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        paddingVertical: 10,
        marginTop: 2,
        justifyContent: 'center',
        alignItems: 'center',
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'bookloop://catalog' }}
    >
      <TextWidget
        text="עוד ספרים  ›"
        style={{ fontSize: 12, fontWeight: '600', color: C.primary }}
      />
    </FlexWidget>
  );
}

// ── Minimalist view: single book cover or logo for tiny widgets ───────────
function MinimalistBookView({
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
          backgroundColor: C.bg,
          borderRadius: 16,
          justifyContent: 'center',
          alignItems: 'center',
        }}
        clickAction="OPEN_APP"
      >
        <TextWidget
          text="BookLoop"
          style={{ fontSize: 13, fontWeight: '700', color: C.primary }}
        />
      </FlexWidget>
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

  return (
    <FlexWidget
      style={{
        flex: 1,
        width: 'match_parent',
        height: 'match_parent',
        backgroundColor: C.bg,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
      }}
      clickAction="OPEN_APP"
    >
      <TextWidget
        text="BookLoop"
        style={{ fontSize: 13, fontWeight: '700', color: C.primary }}
      />
    </FlexWidget>
  );
}

/**
 * Widget 1 — Full widget with logo header, scrollable vertical book cards.
 */
export function BookWidget({
  books,
  columns,
  imgWidth,
  imgHeight,
  listHeight,
  isLoading,
  isMinimalist,
}: {
  books: WidgetBook[];
  columns: number;
  imgWidth: number;
  imgHeight: number;
  listHeight: number;
  isLoading: boolean;
  isMinimalist: boolean;
}) {
  // Tiny widget: minimalist single-cover view
  if (isMinimalist) {
    return <MinimalistBookView book={books[0]} isLoading={isLoading} />;
  }

  const hasBooks = books.length > 0;
  // For skeleton, show 4 placeholder slots
  const skeletonSlots = columns === 1 ? [0, 1, 2, 3] : [[0, 1], [2, 3]];
  const rows = chunk(books, columns);

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: C.bg,
        borderRadius: 16,
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Blue accent bar */}
      <FlexWidget
        style={{ width: 'match_parent', height: 3, backgroundColor: C.primary }}
      />

      {/* Header with logo */}
      <FlexWidget
        style={{
          width: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: 6,
          backgroundColor: C.white,
        }}
        clickAction="OPEN_APP"
      >
        <ImageWidget
          image={require('../../assets/logo.png')}
          imageWidth={90}
          imageHeight={20}
          radius={0}
        />
        <TextWidget
          text="  ·  ספרים חדשים"
          style={{ fontSize: 11, color: C.muted }}
        />
      </FlexWidget>

      {/* Skeleton loading state */}
      {isLoading ? (
        <ListWidget
          style={{ width: 'match_parent', height: listHeight, backgroundColor: C.bg }}
        >
          {columns === 1 ? (
            [0, 1, 2, 3].map((i) => (
              <FlexWidget
                key={`sk${i}`}
                style={{
                  width: 'match_parent',
                  paddingHorizontal: 8,
                  marginBottom: 6,
                }}
              >
                <SkeletonWideCard />
              </FlexWidget>
            ))
          ) : (
            [[0, 1], [2, 3]].map((pair, i) => (
              <FlexWidget
                key={`skr${i}`}
                style={{
                  width: 'match_parent',
                  flexDirection: 'row',
                  paddingHorizontal: 4,
                  marginBottom: 8,
                }}
              >
                <SkeletonVerticalCard imgWidth={imgWidth} imgHeight={imgHeight} />
                <SkeletonVerticalCard imgWidth={imgWidth} imgHeight={imgHeight} />
              </FlexWidget>
            ))
          )}
        </ListWidget>
      ) : hasBooks ? (
        <ListWidget
          style={{
            width: 'match_parent',
            height: listHeight,
            backgroundColor: C.bg,
          }}
        >
          {rows.map((row, rowIdx) => (
            <FlexWidget
              key={`r${rowIdx}`}
              style={{
                width: 'match_parent',
                flexDirection: columns === 1 ? 'column' : 'row',
                paddingHorizontal: columns === 1 ? 8 : 4,
                marginBottom: columns === 1 ? 6 : 8,
              }}
            >
              {columns === 1 ? (
                <WideCard book={row[0]} />
              ) : (
                <FlexWidget style={{ width: 'match_parent', flexDirection: 'row' }}>
                  <VerticalCard book={row[0]} imgWidth={imgWidth} imgHeight={imgHeight} />
                  {row.length > 1 ? (
                    <VerticalCard book={row[1]} imgWidth={imgWidth} imgHeight={imgHeight} />
                  ) : (
                    <EmptySlot />
                  )}
                </FlexWidget>
              )}
            </FlexWidget>
          ))}
          <SeeMoreLink />
        </ListWidget>
      ) : (
        <FlexWidget
          style={{
            flex: 1,
            width: 'match_parent',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          clickAction="OPEN_APP"
        >
          <TextWidget
            text="אין ספרים עדיין"
            style={{ fontSize: 14, fontWeight: '600', color: C.sub }}
          />
          <TextWidget
            text="לחץ לפתיחת BookLoop"
            style={{ fontSize: 12, color: C.muted, marginTop: 4 }}
          />
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
