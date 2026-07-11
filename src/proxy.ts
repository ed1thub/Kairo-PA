import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/telegram/webhook",
  "/api/webhooks/clerk",
  "/api/cron/(.*)",
  "/api/health",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals, static assets, and the Workflow DevKit's
    // internal .well-known/workflow/* endpoint (intercepting it here breaks
    // workflow suspend/resume — see @workflow/next setup docs).
    "/((?!_next/static|_next/image|favicon.ico|.well-known/workflow/).*)",
    "/(api|trpc)(.*)",
  ],
};
