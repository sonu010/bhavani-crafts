/**
 * sweep-broken-images.mjs (P5-T06)
 *
 * Nightly catalog hygiene. HEADs every non-deleted `product_images.url`
 * and flips `license_status` to `removed` for confirmed-dead URLs
 * (HTTP 4xx). The storefront's anon-SELECT RLS hides anything not in
 * (`owned`, `licensed`, `public_domain`), so flipping a 404'd image to
 * `removed` instantly takes it off the storefront without breaking
 * the product page (downstream readers tolerate empty image arrays).
 *
 *   node scripts/sweep-broken-images.mjs            # from web/
 *   node scripts/sweep-broken-images.mjs --dry-run  # report, don't write
 *   node scripts/sweep-broken-images.mjs --limit=500  # cap rows scanned
 *
 * Conservative flip policy:
 *   4xx  → flip (the asset is gone for good)
 *   5xx  → skip (CDN may be temporarily down; try tomorrow)
 *   net err / timeout → skip (transient; try tomorrow)
 *   2xx  → leave alone
 *   3xx  → follow redirect once, then categorise the final response
 *
 * Reads only:
 *   - `product_images.id, url, license_status`
 *
 * Writes only:
 *   - `product_images.license_status = 'removed'` (with note appended
 *     to `source_attribution` so admins can see why it flipped)
 *
 * Does NOT touch images that are already `disputed` or `removed` —
 * those are owner-set flags or were flipped on a prior run.
 *
 * Exits 0 on a clean sweep, 1 if more than 10% of URLs flipped
 * (cliff guard — something's wrong if a tenth of the CDN is dead in
 * one night).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// ─── CLI args ──────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

const CONCURRENCY = 8;
const HEAD_TIMEOUT_MS = 5000;
const PAGE = 1000;
const CLIFF_GUARD_PCT = 10; // exit 1 if > 10% of rows flipped

// ─── Env ───────────────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), ".env.local");
if (!existsSync(envPath)) {
  console.error("sweep-broken-images: web/.env.local not found. Run from web/.");
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
  console.error(
    "sweep-broken-images: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required.",
  );
  process.exit(2);
}

const sb = createClient(url, srv, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── Read every non-deleted image (paginated) ──────────────────────────
async function fetchAllImages() {
  const rows = [];
  for (let from = 0; from < LIMIT; from += PAGE) {
    const to = Math.min(from + PAGE - 1, LIMIT - 1);
    const { data, error } = await sb
      .from("product_images")
      .select("id, url, license_status")
      .is("deleted_at", null)
      // Don't waste budget on already-removed images; they're already
      // hidden by RLS. The whole point of this sweep is to catch ones
      // that *should* be flipped but aren't.
      .not("license_status", "in", "(removed,disputed)")
      .range(from, to)
      .order("id", { ascending: true });
    if (error) throw new Error(`product_images read failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

// ─── HEAD with timeout + one redirect follow ──────────────────────────
async function probeUrl(targetUrl) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), HEAD_TIMEOUT_MS);
  try {
    // Some CDNs reject HEAD (405) but answer GET. The cleanest fallback
    // is `GET` with a `Range: bytes=0-0` header — we get 1 byte at most.
    let res = await fetch(targetUrl, { method: "HEAD", signal: ctl.signal, redirect: "follow" });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(targetUrl, {
        method: "GET",
        signal: ctl.signal,
        redirect: "follow",
        headers: { Range: "bytes=0-0" },
      });
    }
    return { status: res.status, kind: classify(res.status) };
  } catch (err) {
    const aborted = err?.name === "AbortError" || /timeout/i.test(err?.message ?? "");
    return { status: 0, kind: aborted ? "timeout" : "network-error", error: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

function classify(status) {
  if (status >= 200 && status < 300) return "alive";
  if (status >= 400 && status < 500) return "dead";
  if (status >= 500) return "transient-5xx";
  if (status >= 300) return "redirect-loop";
  return "unknown";
}

// ─── Small p-limit-style runner ────────────────────────────────────────
async function runConcurrent(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        out[i] = await worker(items[i], i);
      }
    }),
  );
  return out;
}

// ─── Flip license_status (one row at a time so we can isolate FK errors) ─
async function flipToRemoved(id, currentStatus) {
  const { error } = await sb
    .from("product_images")
    .update({
      license_status: "removed",
      source_attribution: `Auto-flipped from ${currentStatus} by sweep-broken-images on ${new Date()
        .toISOString()
        .slice(0, 10)}: HEAD/GET returned 4xx`,
    })
    .eq("id", id);
  if (error) throw new Error(`flip ${id} failed: ${error.message}`);
}

// ─── Main ──────────────────────────────────────────────────────────────
async function main() {
  const startedAt = Date.now();
  console.log(
    `sweep-broken-images ${DRY_RUN ? "[DRY RUN]" : ""} @ ${new URL(url).host}\n`,
  );

  const images = await fetchAllImages();
  console.log(`  loaded ${images.length} non-removed/non-disputed image rows`);

  const summary = {
    alive: 0,
    dead: 0,
    "transient-5xx": 0,
    "redirect-loop": 0,
    timeout: 0,
    "network-error": 0,
    unknown: 0,
  };
  const deadRows = [];

  await runConcurrent(images, CONCURRENCY, async (row) => {
    const probe = await probeUrl(row.url);
    summary[probe.kind] = (summary[probe.kind] ?? 0) + 1;
    if (probe.kind === "dead") deadRows.push({ row, probe });
  });

  const elapsedMs = Date.now() - startedAt;
  console.log(`\n  probe summary (${(elapsedMs / 1000).toFixed(1)}s):`);
  for (const [kind, n] of Object.entries(summary)) {
    if (n > 0) console.log(`    ${kind.padEnd(20)} ${n}`);
  }

  const deadPct = (deadRows.length / Math.max(images.length, 1)) * 100;
  console.log(
    `\n  ${deadRows.length} confirmed-dead URLs (${deadPct.toFixed(1)}% of scanned)`,
  );

  if (deadRows.length > 0 && deadPct >= CLIFF_GUARD_PCT) {
    console.error(
      `\n::error::Cliff guard tripped: ${deadPct.toFixed(1)}% dead is too high. ` +
        "Refusing to flip — investigate before re-running.",
    );
    // Don't flip; exit non-zero so the workflow surfaces this loud.
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("\n  [DRY RUN] would flip these URLs to license_status='removed':");
    for (const { row, probe } of deadRows.slice(0, 20)) {
      console.log(`    ${row.id}  ${probe.status}  ${row.url}`);
    }
    if (deadRows.length > 20) {
      console.log(`    ... and ${deadRows.length - 20} more`);
    }
    return;
  }

  let flipped = 0;
  for (const { row } of deadRows) {
    try {
      await flipToRemoved(row.id, row.license_status);
      flipped++;
    } catch (err) {
      console.error(`  flip ${row.id} failed: ${err.message}`);
    }
  }
  console.log(`\n✔ flipped ${flipped} image rows to license_status='removed'.`);
}

main().catch((err) => {
  console.error("\nsweep-broken-images crashed:", err.message ?? err);
  process.exit(2);
});
