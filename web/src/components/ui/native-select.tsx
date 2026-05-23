/**
 * Native `<select>` wrapper with consistent styling.
 *
 * Why a native select instead of a custom one: the OS picker is the
 * best UX on touch devices and accessibility is free. We pay only
 * the styling tax.
 *
 * `text-base md:text-sm` is load-bearing — iOS Safari auto-zooms on
 * focus when the field's computed font-size is < 16px. We keep the
 * desktop visual at 14px because of the dense admin layouts.
 */
import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type NativeSelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  function NativeSelect({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          // base mirrors Input: h-9 mobile (more comfortable touch),
          // text-base on mobile to dodge iOS auto-zoom, switches to
          // text-sm on md+ where pointer precision is fine.
          "h-9 w-full rounded-md border border-husk-200 bg-paper-0 px-2 text-base text-bark-900 outline-none transition-colors focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);
