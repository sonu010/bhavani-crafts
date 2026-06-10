/**
 * backfill-image-blurs.mjs (P4-T12)
 *
 * Generate `product_images.blur_data_url` (LQIP) for every non-deleted
 * row missing one. The storefront's `<Image placeholder="blur"
 * blurDataURL={...}>` already reads this column on PDPs + cards; rows
 * without it fall back to `placeholder="empty"`, which shows a flash
 * of the husk-100 background colour during decode.
 *
 *   node scripts/backfill-image-blurs.mjs              # from web/
 *   node scripts/backfill-image-blurs.mjs --dry-run    # count only
 *   node scripts/backfill-image-blurs.mjs --limit=500  # cap rows
 *
 * Idempotent: filters `WHERE blur_data_url IS NULL`, so re-running picks
 * up only the remainder. Failures (bad bytes, network error) log + skip;
 * the broken-image cron (P5-T06) will eventually flip those to
 * `license_status='removed'` so they don't get re-tried forever.
 *
 * Strategy:
 *   - Concurrency 4 (sharp is CPU-heavy; more saturates the box).
 *   - 8×8 webp at quality 50 → ~180–220 bytes base64.
 *   - 5s timeout per fetch.
 *   - Skip rows where license_status is `removed` or `disputed` — those
 *     are never shown publicly, no point spending CPU on them.
 */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

const CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 5000;
const PAGE = 1000;

// ─── Env ───────────────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), ".env.local");
if (!existsSync(envPath)) {
  console.error("backfill-image-blurs: web/.env.local not found. Run from web/.");
  process.exit(2);
}
const env = {};
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const url = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const srv = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !srv) {
  console.error("backfill-image-blurs: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required.");
  process.exit(2);
}

const sb = createClient(url, srv, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── Read every non-deleted, non-removed/disputed row missing a blur ───
async function fetchTargets() {
  const rows = [];
  for (let from = 0; from < LIMIT; from += PAGE) {
    const to = Math.min(from + PAGE - 1, LIMIT - 1);
    const { data, error } = await sb
      .from("product_images")
      .select("id, url")
      .is("blur_data_url", null)
      .is("deleted_at", null)
      .not("license_status", "in", "(removed,disputed)")
      .range(from, to)
      .order("id", { ascending: true });
    if (error) throw new Error(`product_images read failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

// ─── Generate one LQIP ────────────────────────────────────────────────
async function generateLqip(targetUrl) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(targetUrl, { signal: ctl.signal, redirect: "follow" });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const lqip = await sharp(buf)
      .resize(8, 8, { fit: "cover" })
      .webp({ quality: 50 })
      .toBuffer();
    return {
      ok: true,
      blurDataUrl: `data:image/webp;base64,${lqip.toString("base64")}`,
    };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

// ─── p-limit-style runner ──────────────────────────────────────────────
async function runConcurrent(items, limit, worker) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        await worker(items[i], i);
      }
    }),
  );
}

// ─── Main ──────────────────────────────────────────────────────────────
async function main() {
  const startedAt = Date.now();
  console.log(
    `backfill-image-blurs ${DRY_RUN ? "[DRY RUN]" : ""} @ ${new URL(url).host}\n`,
  );

  const targets = await fetchTargets();
  console.log(`  ${targets.length} rows missing blur_data_url`);

  if (DRY_RUN) {
    console.log("\n  [DRY RUN] would generate LQIPs for all of the above.");
    return;
  }

  if (targets.length === 0) {
    console.log("\n✔ Nothing to do — every visible image already has a blur.");
    return;
  }

  let ok = 0;
  let skipped = 0;
  let lastLogged = 0;

  await runConcurrent(targets, CONCURRENCY, async (row) => {
    const lqip = await generateLqip(row.url);
    if (!lqip.ok) {
      skipped++;
      return;
    }
    const { error } = await sb
      .from("product_images")
      .update({ blur_data_url: lqip.blurDataUrl })
      .eq("id", row.id);
    if (error) {
      console.error(`  flip ${row.id} write failed: ${error.message}`);
      skipped++;
      return;
    }
    ok++;
    // Progress log every 250 successes.
    if (ok - lastLogged >= 250) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
      console.log(`  ${ok} done · ${skipped} skipped · ${elapsed}s elapsed`);
      lastLogged = ok;
    }
  });

  const elapsedS = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `\n✔ wrote ${ok} blurs · skipped ${skipped} (network or bad bytes) · ${elapsedS}s total.`,
  );
}

main().catch((err) => {
  console.error("\nbackfill-image-blurs crashed:", err.message ?? err);
  process.exit(2);
});
