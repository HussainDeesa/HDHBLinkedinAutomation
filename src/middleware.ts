export { default } from "next-auth/middleware";

export const config = {
  // Protect everything except auth endpoints, the login page, and static assets.
  matcher: [
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)",
  ],
};
