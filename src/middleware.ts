export { auth as middleware } from "@/auth";

export const config = {
  // matcher: ["/admin/:path*", "/checkout/:path*"], // Optionally protect checkout too
  matcher: ["/admin/:path*"],
};
