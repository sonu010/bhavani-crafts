import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Shared wrapper for the six dashboard widgets so titles + spacing stay
 * consistent. Title in Manrope (default body), numerics inside the
 * card go in JetBrains Mono per design-system.md.
 */
export function WidgetCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <CardTitle className="text-xs uppercase tracking-wide text-stone-500">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
