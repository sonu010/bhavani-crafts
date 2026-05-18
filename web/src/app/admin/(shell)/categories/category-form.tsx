"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CategoryEditInputSchema,
  type CategoryEditInput,
  type CategoryTreeNode,
  slugifyForCategory,
} from "@/lib/schemas/category";
import { createCategoryAction, updateCategoryAction } from "./actions";

interface FlatNode {
  id: string;
  name: string;
  depth: number;
}

function flatten(
  nodes: CategoryTreeNode[],
  depth = 0,
  skipId: string | null = null,
  out: FlatNode[] = [],
): FlatNode[] {
  for (const n of nodes) {
    if (n.id === skipId) continue; // Hide self + entire subtree from parent picker
    out.push({ id: n.id, name: n.name, depth });
    if (n.children.length > 0) {
      flatten(n.children, depth + 1, skipId, out);
    }
  }
  return out;
}

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-husk-200 bg-paper-0 px-2 text-sm text-bark-900 outline-none focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30";

/**
 * Shared create + edit form. `mode='create'` redirects to the new
 * row's edit page on success; `mode='edit'` stays put and toasts.
 *
 * Slug auto-derives from name until the owner edits it manually
 * (tracked via local `slugTouched` state).
 *
 * Parent picker filters out the current category's subtree to
 * prevent cycles; the server also rejects.
 */
export function CategoryForm({
  mode,
  categoryId,
  initial,
  categoryTree,
}: {
  mode: "create" | "edit";
  categoryId?: string;
  initial: CategoryEditInput;
  categoryTree: CategoryTreeNode[];
}) {
  const router = useRouter();
  const [isPending, startSave] = useTransition();
  const [slugTouched, setSlugTouched] = useState(mode === "edit");

  const form = useForm<CategoryEditInput>({
    resolver: zodResolver(CategoryEditInputSchema),
    defaultValues: initial,
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    setError,
    getValues,
    control,
  } = form;

  // Auto-slug from name until owner edits the slug field manually.
  const nameWatch = useWatch({ control, name: "name" });
  useEffect(() => {
    if (slugTouched) return;
    setValue("slug", slugifyForCategory(nameWatch ?? ""), { shouldDirty: true });
  }, [nameWatch, slugTouched, setValue]);

  const flatParents = useMemo(
    () => flatten(categoryTree, 0, mode === "edit" ? categoryId ?? null : null),
    [categoryTree, categoryId, mode],
  );

  const onSubmit = useCallback(
    (values: CategoryEditInput) => {
      startSave(async () => {
        const r =
          mode === "create"
            ? await createCategoryAction(values)
            : await updateCategoryAction(categoryId!, values);

        if (r.ok) {
          toast.success(mode === "create" ? "Category created" : "Saved");
          if (mode === "create" && "id" in r) {
            router.push(`/admin/categories/${r.id}/edit`);
            return;
          }
          // edit: stay; refresh the tree-affected page on next nav.
        } else {
          if (r.error.code === "validation") {
            for (const i of r.error.issues) {
              setError(i.path[0] as keyof CategoryEditInput, {
                type: "server",
                message: i.message,
              });
            }
            toast.error("Some fields need attention");
          } else if (r.error.code === "slug_in_use") {
            setError("slug", { type: "server", message: "Slug already in use" });
            toast.error("Slug already in use");
          } else if (r.error.code === "invalid_parent") {
            setError("parent_id", {
              type: "server",
              message:
                r.error.reason === "self"
                  ? "Cannot pick the category itself"
                  : r.error.reason === "descendant"
                    ? "Cannot pick a descendant"
                    : "Parent doesn't exist",
            });
            toast.error("Invalid parent");
          } else if (r.error.code === "not_found") {
            toast.error("Category not found");
          }
        }
      });
    },
    [mode, categoryId, router, setError],
  );

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6 pb-24"
      noValidate
    >
      <fieldset className="space-y-4 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          Basics
        </legend>

        <Field label="Name" error={errors.name?.message}>
          <Input
            {...register("name")}
            aria-invalid={!!errors.name}
            autoFocus={mode === "create"}
          />
        </Field>

        <Field
          label="Slug"
          error={errors.slug?.message}
          hint={`/c/${getValues("slug") || "—"}`}
        >
          <Input
            {...register("slug", {
              onChange: () => setSlugTouched(true),
            })}
            aria-invalid={!!errors.slug}
            className="font-mono text-sm"
          />
        </Field>

        <Field label="Description" error={errors.description?.message}>
          <Textarea
            {...register("description")}
            rows={4}
            placeholder="Plain text — appears on the category landing page."
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          Hierarchy
        </legend>

        <Field
          label="Parent"
          error={errors.parent_id?.message}
          hint="Leave empty for a top-level category."
        >
          <select
            {...register("parent_id", {
              setValueAs: (v: string) => (v === "" ? null : v),
            })}
            className={SELECT_CLASS}
            aria-invalid={!!errors.parent_id}
          >
            <option value="">(top level)</option>
            {flatParents.map((p) => (
              <option key={p.id} value={p.id}>
                {"— ".repeat(p.depth)}
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Sort order"
          error={errors.sort_order?.message}
          hint="Lower = earlier in sibling lists."
        >
          <Input
            type="number"
            inputMode="numeric"
            {...register("sort_order", { valueAsNumber: true })}
            aria-invalid={!!errors.sort_order}
            className="w-32"
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          Display
        </legend>

        <Field
          label="Cover image URL"
          error={errors.image_url?.message}
          hint="Optional. Paste a hosted image URL — direct uploads land in a follow-up."
        >
          <Input
            type="url"
            {...register("image_url", {
              setValueAs: (v: string) => v?.trim() || null,
            })}
            aria-invalid={!!errors.image_url}
          />
        </Field>

        <Field
          label="Meta title"
          error={errors.meta_title?.message}
          hint="≤ 60 chars. Falls back to category name on the storefront."
        >
          <Input
            {...register("meta_title", {
              setValueAs: (v: string) => v?.trim() || null,
            })}
            aria-invalid={!!errors.meta_title}
          />
        </Field>

        <Field
          label="Meta description"
          error={errors.meta_description?.message}
          hint="≤ 160 chars. Falls back to the description's first 160 chars."
        >
          <Textarea
            {...register("meta_description", {
              setValueAs: (v: string) => v?.trim() || null,
            })}
            rows={3}
          />
        </Field>
      </fieldset>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-husk-200 bg-paper-0/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Link
          href="/admin/categories"
          className="text-sm text-stone-500 underline-offset-2 hover:text-bark-900 hover:underline"
        >
          Cancel
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : mode === "create" ? "Create" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium text-bark-900">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="block text-xs text-brick-600">
          {error}
        </span>
      ) : hint ? (
        <span className="block text-xs text-stone-500">{hint}</span>
      ) : null}
    </label>
  );
}
