/**
 * Shared editor-tab vocabulary. Plain non-client module so server page
 * + client editor component can both import `pickTab` / `TABS` without
 * Next refusing to call a "use client" export from server context.
 */

export type EditorTab =
  | "general"
  | "category"
  | "attributes"
  | "variants"
  | "images"
  | "publish";

export const TABS: { value: EditorTab; label: string }[] = [
  { value: "general", label: "General" },
  { value: "category", label: "Category" },
  { value: "attributes", label: "Attributes" },
  { value: "variants", label: "Variants" },
  { value: "images", label: "Images" },
  { value: "publish", label: "Publish" },
];

const VALID_TAB_SET = new Set<EditorTab>(TABS.map((t) => t.value));

export function isEditorTab(v: string | null | undefined): v is EditorTab {
  return v != null && VALID_TAB_SET.has(v as EditorTab);
}

export function pickTab(raw: string | null | undefined): EditorTab {
  return isEditorTab(raw) ? raw : "general";
}
