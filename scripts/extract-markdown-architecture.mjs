#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "docs", "idea-architecture", "generated");

const SOURCE_ROOTS = ["claude", "user", "docs", "web", "extracted_ideas"];
const SKIP_DIRS = new Set([
  ".git",
  ".next",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".turbo",
]);

const GENERATED_PREFIX = "docs/idea-architecture/";

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function relative(filePath) {
  return toPosix(path.relative(ROOT, filePath));
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...(await walk(path.join(dir, entry.name))));
      continue;
    }

    if (entry.isFile()) {
      files.push(path.join(dir, entry.name));
    }
  }

  return files;
}

function sourceGroup(relPath) {
  if (relPath.startsWith("claude/architecture/")) return "current architecture";
  if (relPath.startsWith("claude/decisions/")) return "architecture decision";
  if (relPath.startsWith("claude/tasks/")) return "task plan";
  if (relPath.startsWith("claude/runbooks/")) return "runbook";
  if (relPath === "claude/plans.md" || relPath === "claude/progress.md") return "program control";
  if (relPath.startsWith("claude/")) return "working memory";
  if (relPath.startsWith("user/")) return "owner guide";
  if (relPath.startsWith("extracted_ideas/")) return "design idea";
  if (relPath.startsWith("web/")) return "app local note";
  if (relPath.startsWith("docs/")) return "reference";
  return "other";
}

function truthRank(group, relPath) {
  if (group === "current architecture" || group === "architecture decision") return 1;
  if (relPath === "claude/plans.md" || relPath === "claude/progress.md") return 2;
  if (group === "task plan" || group === "runbook" || group === "working memory") return 3;
  if (group === "owner guide") return 4;
  if (relPath === "docs/system-overview.md") return 7;
  if (group === "design idea") return 8;
  if (group === "app local note") return 9;
  return 6;
}

function parseFrontmatter(content) {
  if (!content.startsWith("---\n")) return {};
  const end = content.indexOf("\n---", 4);
  if (end === -1) return {};
  const block = content.slice(4, end).trim();
  const data = {};

  for (const line of block.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.replace(/\s+#.*$/, "").trim();

    if (value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else if (/^\d+(\.\d+)?$/.test(value)) {
      value = Number(value);
    } else {
      value = value.replace(/^["']|["']$/g, "");
    }

    data[key] = value;
  }

  return data;
}

function stripHtml(input) {
  return decodeEntities(input)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(input) {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function countPlanStatuses(content) {
  const markers = [
    ["done", /\u2705/],
    ["in_progress", /\uD83D\uDFE1/],
    ["blocked", /\uD83D\uDEA7/],
    ["deferred", /\u23F8\uFE0F/],
    ["not_started", /\u2B1C/],
  ];
  const counts = {};

  for (const line of content.split("\n")) {
    if (!line.startsWith("- ")) continue;
    if (line.includes("not started") && line.includes("in progress")) continue;

    for (const [status, marker] of markers) {
      if (!marker.test(line)) continue;
      counts[status] = (counts[status] || 0) + 1;
      break;
    }
  }

  return counts;
}

function parseMarkdown(content, relPath) {
  const frontmatter = parseFrontmatter(content);
  const headings = [];

  for (const line of content.split("\n")) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (!match) continue;
    headings.push({
      depth: match[1].length,
      text: match[2].replace(/`/g, "").trim(),
    });
  }

  const h1 = headings.find((heading) => heading.depth === 1)?.text;
  const group = sourceGroup(relPath);

  const source = {
    path: relPath,
    type: "markdown",
    group,
    truthRank: truthRank(group, relPath),
    title: frontmatter.title || h1 || path.basename(relPath, ".md"),
    frontmatter,
    headings,
    lineCount: content.split("\n").length,
    wordCount: content.split(/\s+/).filter(Boolean).length,
  };

  if (relPath === "claude/plans.md") {
    source.planStatusCounts = countPlanStatuses(content);
  }

  return source;
}

function parseIdeaHtml(content, relPath) {
  const title = content.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const headingMatches = [...content.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)];
  const altMatches = [...content.matchAll(/<img[^>]*\salt="([^"]+)"/gi)];
  const group = sourceGroup(relPath);

  return {
    path: relPath,
    type: "idea-html",
    group,
    truthRank: truthRank(group, relPath),
    title: decodeEntities(title || path.basename(path.dirname(relPath))),
    headings: headingMatches.slice(0, 12).map((match) => ({
      depth: Number(match[1]),
      text: stripHtml(match[2]),
    })),
    imageAlts: altMatches.slice(0, 8).map((match) => match[1].trim()),
    lineCount: content.split("\n").length,
    wordCount: stripHtml(content).split(/\s+/).filter(Boolean).length,
  };
}

async function collectSources() {
  const files = [];

  for (const sourceRoot of SOURCE_ROOTS) {
    const absoluteRoot = path.join(ROOT, sourceRoot);
    const walked = await walk(absoluteRoot);
    files.push(...walked);
  }

  const sources = [];
  for (const file of files.sort()) {
    const relPath = relative(file);
    if (relPath.startsWith(GENERATED_PREFIX)) continue;

    if (relPath.endsWith(".md")) {
      const content = await readFile(file, "utf8");
      sources.push(parseMarkdown(content, relPath));
      continue;
    }

    if (relPath.startsWith("extracted_ideas/") && relPath.endsWith("/code.html")) {
      const content = await readFile(file, "utf8");
      sources.push(parseIdeaHtml(content, relPath));
    }
  }

  return sources;
}

function sortSources(sources) {
  return [...sources].sort((a, b) => {
    if (a.truthRank !== b.truthRank) return a.truthRank - b.truthRank;
    return a.path.localeCompare(b.path);
  });
}

function groupCounts(sources) {
  const counts = new Map();
  for (const source of sources) {
    counts.set(source.group, (counts.get(source.group) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function taskSources(sources) {
  return sources
    .filter(
      (source) =>
        source.path.startsWith("claude/tasks/")
        && source.path.endsWith(".md")
        && source.path !== "claude/tasks/_template.md",
    )
    .map((source) => ({
      path: source.path,
      id: source.frontmatter.id || path.basename(source.path, ".md").split("-").slice(0, 2).join("-"),
      phase: source.frontmatter.phase ?? null,
      title: source.frontmatter.title || source.title,
      status: source.frontmatter.status || "unknown",
      depends_on: Array.isArray(source.frontmatter.depends_on)
        ? source.frontmatter.depends_on
        : [],
      estimate_hours: source.frontmatter.estimate_hours ?? null,
      owner: source.frontmatter.owner || null,
      last_updated: source.frontmatter.last_updated || null,
      isStub: source.wordCount < 120 || source.headings.length < 3,
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function adrSources(sources) {
  return sources
    .filter((source) => source.path.startsWith("claude/decisions/") && source.path.endsWith(".md"))
    .map((source) => {
      const id = path.basename(source.path, ".md").split("-").slice(0, 2).join("-");
      const title = source.title.replace(new RegExp(`^${id}\\s+[\\u2013\\u2014-]\\s+`), "");

      return {
        path: source.path,
        id,
        title,
      };
    });
}

function ideaSources(sources) {
  return sources
    .filter((source) => source.group === "design idea")
    .map((source) => ({
      path: source.path,
      type: source.type,
      title: source.title,
      headings: source.headings.map((heading) => heading.text),
      imageAlts: source.imageAlts || [],
    }));
}

function statusCounts(tasks) {
  const counts = {};
  for (const task of tasks) {
    counts[task.status] = (counts[task.status] || 0) + 1;
  }
  return counts;
}

function phaseCounts(tasks) {
  const phases = new Map();
  for (const task of tasks) {
    const key = `Phase ${task.phase}`;
    if (!phases.has(key)) phases.set(key, { total: 0, statuses: {} });
    const phase = phases.get(key);
    phase.total += 1;
    phase.statuses[task.status] = (phase.statuses[task.status] || 0) + 1;
  }
  return [...phases.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function mdTable(rows) {
  if (rows.length === 0) return "";
  const widths = rows[0].map((_, columnIndex) =>
    Math.max(...rows.map((row) => String(row[columnIndex]).length)),
  );

  const line = (row) =>
    `| ${row.map((cell, index) => String(cell).padEnd(widths[index])).join(" | ")} |`;

  return [
    line(rows[0]),
    line(widths.map((width) => "-".repeat(Math.max(3, width)))),
    ...rows.slice(1).map(line),
  ].join("\n");
}

function headingsSummary(source) {
  return source.headings
    .filter((heading) => heading.depth <= 2)
    .slice(0, 4)
    .map((heading) => heading.text)
    .join("; ");
}

function renderInventory(index) {
  const rows = [
    ["Group", "Rank", "File", "Title / headings"],
    ...sortSources(index.sources).map((source) => [
      source.group,
      source.truthRank,
      source.path,
      headingsSummary(source) || source.title,
    ]),
  ];

  return `# Markdown and idea inventory

Generated by \`node scripts/extract-markdown-architecture.mjs\`.

The rank column is the source-of-truth order used by the architecture docs:

1. Current architecture and accepted ADRs
2. Program control docs
3. Task plans, runbooks, working memory
4. Owner-facing instructions
7. Legacy or broad reference docs
8. Design idea prototypes
9. App-local notes

## Source counts

${mdTable([
  ["Group", "Files"],
  ...index.groupCounts.map(([group, count]) => [group, count]),
])}

## Files

${mdTable(rows)}
`;
}

function renderIdeaMap(index) {
  const sourceLink = (sourcePath) => `../../../${sourcePath}`;
  const adrs = index.adrs.map((adr) => `- [${adr.id}: ${adr.title}](${sourceLink(adr.path)})`).join("\n");
  const ideas = index.ideas
    .map((idea) => {
      const headings = idea.headings.length ? ` Headings: ${idea.headings.slice(0, 4).join("; ")}.` : "";
      return `- [${idea.title}](${sourceLink(idea.path)}) (${idea.type}).${headings}`;
    })
    .join("\n");

  return `# Idea map

Generated by \`node scripts/extract-markdown-architecture.mjs\`.

## How to read the sources

The current rebuild truth is \`claude/architecture/*\`, accepted ADRs, \`claude/plans.md\`, and task files. \`docs/system-overview.md\` describes the older high-fidelity prototype and contains ideas that conflict with the rebuild MVP, such as Auth.js, checkout, and broader customer account flows. Keep it as historical context, not as the implementation contract.

## Current product idea

Bhavani Crafts is a mobile-first catalog and admin system for a Hyderabad craft supplies retailer. MVP scope is public browsing, catalog search/filtering, local cart, and a strong owner/admin workflow. Checkout, payments, customer accounts, creator community, and creator profiles are intentionally out of MVP even though prototypes exist for them.

## Architecture decision spine

${adrs}

## Active rebuild tracks

- Data foundation: Supabase Postgres schema, typed data layer, RLS, indexes, launch blockers, CI.
- Admin foundation: email/password login, owner TOTP, admin shell, product/category/tag/attribute management, CSV import, audit log, jobs, trash.
- Storefront: ISR landing, categories, product detail, search, cart drawer, mobile performance, Lighthouse pass.
- AI assistance: category/tag suggestions, alt text, description drafts, duplicate detection, CSV cleanup, synonym mining. AI writes proposals only; admin acceptance is required.
- Launch readiness: legal pages, contact/about, sitemap/robots, OG images, analytics/Sentry, broken-image cron, backups, RLS attack test, go-live.

## Deferred or future ideas

${ideas}

## Presentation storyline

1. Start with the source-of-truth rule so prototype ideas do not override current architecture.
2. Show the system context: Browser and Next.js server over Supabase, with Vercel, GitHub Actions, Anthropic, Sentry, and analytics.
3. Show the domain class diagram: products, variants, options, attributes, tags, images, jobs, imports, audit, AI generations.
4. Walk through the critical workflows: admin mutation, auth gate, search, image upload, background jobs, AI proposal review.
5. End with the phase pipeline so the audience can see what is already done and what remains.
`;
}

function renderArchitecture(index) {
  return `# Complete architecture visual pack

Generated by \`node scripts/extract-markdown-architecture.mjs\`.

## System context

\`\`\`mermaid
flowchart TB
  Visitor["Public visitor browser"] --> Storefront["Next.js App Router storefront"]
  Owner["Owner/admin browser"] --> Admin["Next.js dynamic admin"]
  Storefront --> DataLayer["Typed data layer"]
  Admin --> Actions["Server actions and route handlers"]
  Actions --> Authz["requireRole + AAL2 checks"]
  Authz --> DataLayer
  DataLayer --> Supabase["Supabase"]
  Supabase --> Postgres["Postgres + RLS + FTS + pg_trgm"]
  Supabase --> Auth["Supabase Auth + MFA"]
  Supabase --> Storage["Supabase Storage product-images"]
  Supabase --> EdgeFunctions["Edge Functions for job ticks"]
  Storefront --> Vercel["Vercel ISR + Edge CDN"]
  Admin --> Vercel
  Actions --> Revalidation["revalidateTag / revalidatePath"]
  Revalidation --> Vercel
  Actions --> Anthropic["Anthropic Claude assistive features"]
  Actions --> Sentry["Sentry"]
  Storefront --> Analytics["Plausible / Vercel analytics"]
  GitHub["GitHub Actions"] --> Postgres
  GitHub --> Backups["pg_dump backups and long jobs"]
\`\`\`

## Application component map

\`\`\`mermaid
flowchart LR
  subgraph Public["Public storefront"]
    Home["/"]
    Category["/c/:slug"]
    Product["/p/:slug"]
    Search["/search?q="]
    Cart["Zustand cart"]
  end

  subgraph Admin["Admin"]
    Login["/login"]
    TwoFA["/admin/2fa-setup and /auth/verify-2fa"]
    Shell["/admin shell"]
    Products["Products editor"]
    Taxonomy["Categories, tags, attributes"]
    Imports["CSV imports"]
    Ops["Audit, jobs, trash"]
  end

  subgraph Server["Server boundary"]
    Middleware["proxy/middleware gate"]
    ServerActions["Server actions"]
    RouteHandlers["Route handlers"]
    DbModules["lib/db modules"]
    AuthModules["lib/auth modules"]
  end

  Public --> DbModules
  Admin --> Middleware
  Middleware --> AuthModules
  Login --> ServerActions
  TwoFA --> ServerActions
  Products --> ServerActions
  Taxonomy --> ServerActions
  Imports --> RouteHandlers
  Ops --> DbModules
  ServerActions --> DbModules
  RouteHandlers --> DbModules
\`\`\`

## Domain class diagram

\`\`\`mermaid
classDiagram
  class Profile {
    uuid id
    profile_role role
    text full_name
  }

  class Category {
    uuid id
    text slug
    text name
    uuid parent_id
    int sort_order
    timestamptz deleted_at
  }

  class Product {
    uuid id
    text sku
    text slug
    text name
    numeric base_price_inr
    stock_status stock_status
    review_status review_status
    boolean is_published
    boolean is_featured
    product_source source
  }

  class ProductImage {
    uuid id
    text url
    text storage_path
    text alt
    int sort_order
    image_source source
    license_status license_status
  }

  class ProductOption {
    uuid id
    text name
    int sort_order
  }

  class ProductOptionValue {
    uuid id
    text value
    int sort_order
  }

  class ProductVariant {
    uuid id
    text sku
    text name
    numeric price_inr
    stock_status stock_status
    boolean is_default
  }

  class AttributeDefinition {
    uuid id
    text slug
    text name
    attribute_type type
    boolean is_filterable
  }

  class ProductAttribute {
    text value_text
    numeric value_number
    boolean value_boolean
  }

  class Tag {
    uuid id
    text slug
    text name
  }

  class AuditLog {
    uuid id
    text action
    text entity_type
    uuid entity_id
    jsonb before_json
    jsonb after_json
  }

  class BackgroundJob {
    uuid id
    text kind
    job_status status
    int progress
    int total
    jsonb checkpoint
  }

  class JobEvent {
    uuid id
    text level
    text message
    jsonb data_json
  }

  class ImportRun {
    uuid id
    text filename
    job_status status
    int total_rows
    int success_count
    int error_count
  }

  class ImportRunRow {
    uuid id
    int row_number
    text sku
    import_action action
    jsonb raw_json
  }

  class SearchSynonym {
    uuid id
    text term
    text[] synonyms
  }

  class SearchLog {
    uuid id
    text query
    int result_count
  }

  class AIGeneration {
    uuid id
    ai_task_type task_type
    text prompt_version
    text model
    text input_hash
    jsonb output_json
    ai_generation_status status
  }

  Category "1" --> "0..*" Category : parent
  Category "1" --> "0..*" Product : contains
  Product "1" --> "0..*" ProductImage : images
  Product "1" --> "0..*" ProductOption : options
  ProductOption "1" --> "0..*" ProductOptionValue : values
  Product "1" --> "0..*" ProductVariant : variants
  ProductVariant "*" --> "*" ProductOptionValue : variant_option_values
  Product "*" --> "*" AttributeDefinition : product_attributes
  Product "*" --> "*" Tag : product_tags
  Profile "1" --> "0..*" Product : creates_updates
  Profile "1" --> "0..*" AuditLog : actor
  BackgroundJob "1" --> "0..*" JobEvent : emits
  ImportRun "1" --> "0..*" ImportRunRow : rows
  Profile "1" --> "0..*" AIGeneration : reviews
  Profile "1" --> "0..*" SearchLog : optional_user
\`\`\`

## Auth and admin gate

\`\`\`mermaid
sequenceDiagram
  participant Browser
  participant Middleware
  participant SupabaseAuth as Supabase Auth
  participant AdminPage as Admin route
  participant RequireRole as requireRole
  participant Postgres as Postgres RLS

  Browser->>Middleware: GET /admin/*
  Middleware->>SupabaseAuth: read cookie session
  SupabaseAuth-->>Middleware: session + AAL
  alt no session
    Middleware-->>Browser: redirect /login
  else AAL1 owner/admin session
    Middleware-->>Browser: redirect /admin/2fa-setup or /auth/verify-2fa
  else AAL2 or allowed route
    Middleware->>AdminPage: continue
    AdminPage->>RequireRole: requireRole(supabase, "admin")
    RequireRole->>Postgres: select profile role
    Postgres-->>RequireRole: role
    RequireRole-->>AdminPage: allow or throw 403
  end
\`\`\`

## Admin mutation and cache invalidation

\`\`\`mermaid
sequenceDiagram
  participant AdminUI
  participant Action as Server action
  participant Authz as requireRole
  participant DB as Supabase Postgres
  participant Audit as audit_logs
  participant Cache as Next/Vercel cache

  AdminUI->>Action: submit catalog mutation
  Action->>Authz: requireRole(supabase, "admin")
  Authz-->>Action: profile
  Action->>DB: validate and write one source of truth
  DB-->>Action: written row
  Action->>Audit: insert mutation audit entry
  Action->>Cache: revalidateTag / revalidatePath
  Action-->>AdminUI: success or clear error
\`\`\`

## Storefront rendering and freshness

\`\`\`mermaid
flowchart LR
  Request["GET /, /c/:slug, /p/:slug"] --> ISR["ISR page"]
  ISR --> CachedRead["unstable_cache / tagged read"]
  CachedRead --> SupabaseRead["Published-only Supabase query"]
  SupabaseRead --> RLS["RLS: is_published and deleted_at checks"]
  RLS --> HTML["Static HTML at Vercel Edge"]
  AdminWrite["Admin write"] --> Revalidate["revalidateTag / revalidatePath"]
  Revalidate --> HTML
  SearchReq["GET /search?q="] --> DynamicSearch["Dynamic uncached render"]
  DynamicSearch --> SearchDb["FTS + trigram + synonyms"]
\`\`\`

## Search query pipeline

\`\`\`mermaid
flowchart TD
  Query["User query"] --> Normalize["trim, lowercase, strip unsupported characters"]
  Normalize --> Synonyms["expand with search_synonyms"]
  Synonyms --> SkuShortcut["exact SKU shortcut"]
  SkuShortcut --> PgQuery["Postgres FTS + trigram + SKU prefix query"]
  PgQuery --> Rank["rank by FTS and trigram score"]
  Rank --> Results["Return 24 results"]
  Results --> Log["write search_logs with result_count"]
  Log --> Mine["Phase 4 synonym mining for zero-result queries"]
\`\`\`

## Image pipeline

\`\`\`mermaid
flowchart TD
  Select["Admin selects image"] --> ClientCheck["Client MIME, size, dimension check"]
  ClientCheck --> Upload["POST /api/admin/images/upload"]
  Upload --> ServerCheck["Server MIME sniff, size, dimensions, strip EXIF"]
  ServerCheck --> Sharp["sharp to WebP sizes and blur placeholder"]
  Sharp --> Storage["Supabase Storage product-images"]
  Storage --> Row["insert product_images row"]
  Row --> Preview["Admin preview"]
  Row --> Public["Storefront next/image only when product and license are public"]
\`\`\`

## Background job state machine

\`\`\`mermaid
stateDiagram-v2
  [*] --> queued
  queued --> running
  running --> succeeded
  running --> failed
  running --> cancelled
  failed --> queued: retry creates new job
  succeeded --> [*]
  cancelled --> [*]
\`\`\`

## AI proposal review flow

\`\`\`mermaid
sequenceDiagram
  participant Admin
  participant Action as AI server action
  participant Claude as Anthropic Claude
  participant Validator as Zod + semantic checks
  participant Store as ai_generations
  participant Catalog as Catalog tables

  Admin->>Action: request suggestion
  Action->>Claude: system prompt + delimited hostile user data
  Claude-->>Action: structured JSON text
  Action->>Validator: parse and semantic checks
  Validator-->>Action: ok or rejected
  Action->>Store: insert proposed/rejected generation
  Admin->>Store: review suggestion
  alt accepted
    Store->>Catalog: apply via normal admin mutation path
  else rejected
    Store-->>Admin: record rejection only
  end
\`\`\`
`;
}

function renderRoadmap(index) {
  const tasks = index.tasks;
  const taskCounts = statusCounts(tasks);
  const planCounts =
    index.sources.find((source) => source.path === "claude/plans.md")?.planStatusCounts || {};
  const phaseRows = [
    ["Phase", "Total", "Done", "In progress", "Blocked", "Deferred", "Not started", "Stubs"],
    ...phaseCounts(tasks).map(([phase, value]) => [
      phase,
      value.total,
      value.statuses.done || 0,
      value.statuses.in_progress || 0,
      value.statuses.blocked || 0,
      value.statuses.deferred || 0,
      value.statuses.not_started || 0,
      tasks.filter((task) => `Phase ${task.phase}` === phase && task.isStub).length,
    ]),
  ];

  const statusRows = [
    ["Status", "Count"],
    ...Object.entries(taskCounts).sort((a, b) => a[0].localeCompare(b[0])),
  ];

  const consistencyRows = [
    ["Status", "Task frontmatter", "plans.md symbols"],
    ...["done", "in_progress", "blocked", "deferred", "not_started"].map((status) => [
      status,
      taskCounts[status] || 0,
      planCounts[status] || 0,
    ]),
  ];

  const stubRows = [
    ["Task", "Title", "File"],
    ...tasks.filter((task) => task.isStub).map((task) => [task.id, task.title, task.path]),
  ];

  return `# Task roadmap

Generated by \`node scripts/extract-markdown-architecture.mjs\`.

## Phase pipeline

\`\`\`mermaid
flowchart LR
  P0["Phase 0 setup and archival"] --> P1["Phase 1 data foundation"]
  P1 --> P15["Phase 1.5 CI"]
  P15 --> P2["Phase 2 admin panel"]
  P2 --> P3["Phase 3 public storefront"]
  P3 --> Gate["Real-content gate"]
  Gate --> P4["Phase 4 AI and polish"]
  P4 --> P5["Phase 5 launch readiness"]
\`\`\`

## Counts by phase

${mdTable(phaseRows)}

## Counts by status

${mdTable(statusRows)}

## Status consistency check

This compares task frontmatter against \`claude/plans.md\` symbols. Differences are not always wrong because \`plans.md\` also tracks a few non-task milestones, but mismatches are drift signals to inspect before deciding what is actually complete.

${mdTable(consistencyRows)}

## Dependency chain for current next work

\`\`\`mermaid
flowchart TD
  P2T00["P2-T00 expand Phase 2 tasks"] --> P2T01["P2-T01 Supabase Auth"]
  P2T01 --> P2T02["P2-T02 profiles trigger / role helper"]
  P2T02 --> P2T03["P2-T03 promote owner runbook"]
  P2T02 --> P2T04["P2-T04 middleware admin gate"]
  P2T04 --> P2T05["P2-T05 admin shell layout"]
  P2T05 --> P2T06["P2-T06 admin dashboard"]
  P2T05 --> P2T07["P2-T07 products list"]
  P2T07 --> P2T28["P2-T28 soft-delete trash"]
  P2T28 --> P2T29["P2-T29 admin mobile pass"]
  P2T29 --> P3T00["P3-T00 expand Phase 3 tasks"]
\`\`\`

## Stub or very small task files

These are intentionally thin when a future phase has not started yet, or they need expansion before implementation.

${mdTable(stubRows)}
`;
}

function renderPipeline(index) {
  return `# Extraction pipeline

Generated by \`node scripts/extract-markdown-architecture.mjs\`.

## Command

\`\`\`bash
node scripts/extract-markdown-architecture.mjs
\`\`\`

## Pipeline diagram

\`\`\`mermaid
flowchart LR
  Sources["claude/, user/, docs/, web/*.md, extracted_ideas/"] --> Scanner["File scanner"]
  Scanner --> Parser["Markdown + idea HTML parser"]
  Parser --> Ranker["Source group + truth-rank classifier"]
  Ranker --> Index["00-source-index.json"]
  Index --> Inventory["01-markdown-inventory.md"]
  Index --> IdeaMap["02-idea-map.md"]
  Index --> Architecture["03-complete-architecture.md"]
  Index --> Roadmap["04-task-roadmap.md"]
  Index --> PipelineDoc["05-extraction-pipeline.md"]
\`\`\`

## What the script extracts

- Markdown files from \`claude/\`, \`user/\`, \`docs/\`, \`web/\`, and \`extracted_ideas/\`.
- Idea prototype HTML files at \`extracted_ideas/**/code.html\`.
- Frontmatter from task files, including \`id\`, \`phase\`, \`status\`, \`depends_on\`, \`estimate_hours\`, and \`last_updated\`.
- H1-H3 headings for inventory and presentation anchors.
- ADR titles and task counts.

## What the script deliberately does not do

- It does not infer current behavior from code. It visualizes the markdown and idea sources.
- It does not treat legacy prototype docs as current truth when they conflict with \`claude/architecture\` or accepted ADRs.
- It does not call external services or use AI, so the output is deterministic and safe to run locally.

## Current extraction summary

- Sources parsed: ${index.sources.length}
- Markdown files: ${index.sources.filter((source) => source.type === "markdown").length}
- Idea HTML prototypes: ${index.sources.filter((source) => source.type === "idea-html").length}
- Task files: ${index.tasks.length}
- ADRs: ${index.adrs.length}
`;
}

async function main() {
  const sources = await collectSources();
  const index = {
    generatedAt: new Date().toISOString(),
    sourceRoots: SOURCE_ROOTS,
    sources: sortSources(sources),
    groupCounts: groupCounts(sources),
    tasks: taskSources(sources),
    adrs: adrSources(sources),
    ideas: ideaSources(sources),
  };

  await mkdir(OUTPUT_DIR, { recursive: true });

  await writeFile(
    path.join(OUTPUT_DIR, "00-source-index.json"),
    `${JSON.stringify(index, null, 2)}\n`,
  );
  await writeFile(path.join(OUTPUT_DIR, "01-markdown-inventory.md"), renderInventory(index));
  await writeFile(path.join(OUTPUT_DIR, "02-idea-map.md"), renderIdeaMap(index));
  await writeFile(path.join(OUTPUT_DIR, "03-complete-architecture.md"), renderArchitecture(index));
  await writeFile(path.join(OUTPUT_DIR, "04-task-roadmap.md"), renderRoadmap(index));
  await writeFile(path.join(OUTPUT_DIR, "05-extraction-pipeline.md"), renderPipeline(index));

  console.log(`Wrote architecture extraction to ${relative(OUTPUT_DIR)}`);
  console.log(`Sources: ${index.sources.length}`);
  console.log(`Tasks: ${index.tasks.length}`);
  console.log(`ADRs: ${index.adrs.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
