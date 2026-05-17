/**
 * Admin navigation tree — single source of truth.
 *
 * Locked in SESSION-RESUME §"Admin navigation tree (P2-T05)". The order
 * and labels are intentional; don't reorder without revisiting that
 * spec.
 *
 * "Audit" navigates to /admin/activity (the URL P2-T26 uses) to keep the
 * route name in line with the existing audit_logs vocabulary. Everything
 * else uses the natural plural.
 */
import {
  Activity,
  FolderTree,
  LayoutDashboard,
  Package,
  ScrollText,
  Settings,
  Sliders,
  Tag,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";

export type AdminNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const ADMIN_NAV: readonly AdminNavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Categories", href: "/admin/categories", icon: FolderTree },
  { label: "Tags", href: "/admin/tags", icon: Tag },
  { label: "Attributes", href: "/admin/attributes", icon: Sliders },
  { label: "Imports", href: "/admin/imports", icon: Upload },
  { label: "Audit", href: "/admin/activity", icon: ScrollText },
  { label: "Jobs", href: "/admin/jobs", icon: Activity },
  { label: "Trash", href: "/admin/trash", icon: Trash2 },
  { label: "Settings", href: "/admin/settings", icon: Settings },
] as const;

export function isActiveNav(itemHref: string, pathname: string): boolean {
  if (itemHref === "/admin") {
    return pathname === "/admin";
  }
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
}
