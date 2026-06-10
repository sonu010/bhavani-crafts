/**
 * Shared OG-image layout for the storefront (P5-T04).
 *
 * Returns the JSX tree that each opengraph-image.tsx file passes
 * to `new ImageResponse(...)`. Keeping the layout in one place means
 * the home / category / PDP OGs stay visually consistent and a brand
 * tweak only touches this file.
 *
 * Design (lifted from `architecture/design-system.md` §"Colors"):
 *   • cream/paper canvas (#FFFCF6)
 *   • bark-900 title (#1C1815) — the headline
 *   • teal-800 wordmark (#1F4E4A)
 *   • clay-600 small caps eyebrow when kind != home
 *   • husk-200 hairline divider
 *
 * Font: defaults to the embedded system serif. Bundling Newsreader
 * to keep the brand display face is a follow-up (see Notes for next
 * agent in P5-T04). For first cut, the system serif renders cleanly
 * enough at 80px+ that share previews still feel branded.
 *
 * Image embed (kind === "product"): Satori fetches the `imageUrl`
 * at render time and inlines it. If the fetch fails (404, CDN
 * timeout, license-status change between cache + share), the
 * template degrades to text-only — never throws.
 */

export interface OgTemplateProps {
  /** Big editorial line. Kept short — wraps at ~28 chars wide. */
  title: string;
  /** Small caps eyebrow above the title. Use sparingly. */
  eyebrow?: string;
  /** ₹ price label rendered below the title for PDPs. */
  priceLabel?: string;
  /** Absolute https URL of a product image to inline on the right. */
  imageUrl?: string;
}

const PAPER = "#FFFCF6";
const BARK = "#1C1815";
const TEAL = "#1F4E4A";
const CLAY = "#B8552E";
const HUSK = "#E6DCC9";
const STONE = "#6E665B";

/**
 * Returns the JSX node to feed `new ImageResponse(...)`. The
 * caller decides size + contentType via the file-convention exports.
 */
export function ogTemplate({ title, eyebrow, priceLabel, imageUrl }: OgTemplateProps) {
  const hasImage = typeof imageUrl === "string" && imageUrl.length > 0;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "row",
        background: PAPER,
        fontFamily: "serif",
        position: "relative",
      }}
    >
      {/* Left: text column */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "72px",
          justifyContent: "space-between",
        }}
      >
        {/* Eyebrow + title block */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {eyebrow ? (
            <div
              style={{
                color: CLAY,
                fontFamily: "monospace",
                fontSize: 22,
                letterSpacing: "0.25em",
                textTransform: "uppercase",
                marginBottom: 32,
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          <div
            style={{
              color: BARK,
              fontSize: title.length > 30 ? 64 : title.length > 20 ? 80 : 96,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              maxWidth: hasImage ? 480 : 920,
              display: "flex",
            }}
          >
            {title}
          </div>
          {priceLabel ? (
            <div
              style={{
                marginTop: 24,
                color: STONE,
                fontFamily: "monospace",
                fontSize: 28,
                letterSpacing: "0.05em",
              }}
            >
              {priceLabel}
            </div>
          ) : null}
        </div>

        {/* Brand footer */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            paddingTop: 24,
            borderTop: `1px solid ${HUSK}`,
          }}
        >
          <div
            style={{
              color: TEAL,
              fontSize: 36,
              letterSpacing: "-0.01em",
              display: "flex",
            }}
          >
            Bhavani{" "}
            <span style={{ color: CLAY, fontStyle: "italic", marginLeft: 14 }}>
              Crafts
            </span>
          </div>
          <div
            style={{
              marginTop: 4,
              color: STONE,
              fontFamily: "monospace",
              fontSize: 14,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            Craft supplies · Hyderabad
          </div>
        </div>
      </div>

      {/* Right: product image (PDP only) */}
      {hasImage ? (
        <div
          style={{
            width: 540,
            display: "flex",
            background: HUSK,
            borderLeft: `1px solid ${HUSK}`,
          }}
        >
          {/* Using `<img>` because next/image isn't supported by
              ImageResponse — Satori inlines via fetch. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            width={540}
            height={630}
            style={{ width: 540, height: 630, objectFit: "cover" }}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Common size export for the file-convention OG handlers. */
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png" as const;
