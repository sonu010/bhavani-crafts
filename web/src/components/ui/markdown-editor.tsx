"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Two-pane markdown editor: Write / Preview toggle.
 *
 * Preview uses the same sanitizer the storefront PDP renders with
 * (rehype-sanitize default schema — strips <script>, <iframe>, event
 * handlers, javascript: URLs per architecture/security.md §"Markdown
 * sanitization"). So what the admin sees IS what the customer sees.
 *
 * Controlled component. The form holds value + onChange via
 * react-hook-form's Controller.
 */
export function MarkdownEditor({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  className,
  rows = 8,
  ariaDescribedBy,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  ariaDescribedBy?: string;
}) {
  const [mode, setMode] = useState<"write" | "preview">("write");

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-husk-200 bg-paper-0",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-husk-200 bg-cream-50 px-2 py-1">
        <span className="text-xs uppercase tracking-wide text-stone-500">
          Markdown
        </span>
        <div
          role="tablist"
          aria-label="Editor mode"
          className="flex gap-1 text-xs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "write"}
            onClick={() => setMode("write")}
            className={cn(
              "rounded px-2 py-0.5",
              mode === "write"
                ? "bg-paper-0 text-bark-900"
                : "text-stone-500 hover:text-bark-900",
            )}
          >
            Write
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "preview"}
            onClick={() => setMode("preview")}
            className={cn(
              "rounded px-2 py-0.5",
              mode === "preview"
                ? "bg-paper-0 text-bark-900"
                : "text-stone-500 hover:text-bark-900",
            )}
          >
            Preview
          </button>
        </div>
      </div>

      {mode === "write" ? (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          rows={rows}
          placeholder={placeholder}
          aria-describedby={ariaDescribedBy}
          className="rounded-none border-0 bg-transparent focus-visible:ring-0"
        />
      ) : (
        <div
          aria-describedby={ariaDescribedBy}
          className="prose prose-sm max-w-none px-3 py-2 text-bark-900"
        >
          {value.trim() ? (
            <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
              {value}
            </ReactMarkdown>
          ) : (
            <p className="text-sm italic text-stone-500">
              Nothing to preview yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
