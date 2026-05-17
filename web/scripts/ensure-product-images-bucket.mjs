#!/usr/bin/env node
/**
 * Ensure the `product-images` Supabase Storage bucket exists.
 *
 *   - public:  true  (CDN-served on the storefront; no signed URLs)
 *   - file size limit: 5 MiB (matches the route-level cap in
 *     /api/admin/images/upload)
 *   - allowed mime types: webp, jpeg, png, heic, heif
 *
 * Idempotent: re-running updates the config rather than failing.
 *
 * Run after `pnpm dlx supabase db push` when bootstrapping a new
 * environment.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(path.join(here, "..", ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const BUCKET = "product-images";
const FIVE_MB = 5 * 1024 * 1024;
const ALLOWED_MIME = [
  "image/webp",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
];

const c = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const list = await c.storage.listBuckets();
if (list.error) {
  console.error("listBuckets:", list.error.message);
  process.exit(1);
}

const exists = (list.data ?? []).find((b) => b.name === BUCKET);
if (exists) {
  console.log(`bucket ${BUCKET} exists; updating config…`);
  const upd = await c.storage.updateBucket(BUCKET, {
    public: true,
    fileSizeLimit: FIVE_MB,
    allowedMimeTypes: ALLOWED_MIME,
  });
  if (upd.error) {
    console.error("updateBucket:", upd.error.message);
    process.exit(1);
  }
  console.log("updated.");
} else {
  console.log(`creating bucket ${BUCKET}…`);
  const cr = await c.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: FIVE_MB,
    allowedMimeTypes: ALLOWED_MIME,
  });
  if (cr.error) {
    console.error("createBucket:", cr.error.message);
    process.exit(1);
  }
  console.log("created.");
}
