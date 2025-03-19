import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { auth } from "@/auth"

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Get the authenticated user
  const session = await auth()

  // Public paths that don't require authentication
  const publicPaths = ["/auth/signin", "/auth/signup", "/auth/forgot-password", "/api/auth/register"]

  // Check if the path is public
  const isPublicPath = publicPaths.some((publicPath) => path === publicPath || path.startsWith("/api/auth/"))

  // Check if user is trying to access protected routes without authentication
  if (!isPublicPath && !session) {
    return NextResponse.redirect(new URL("/auth/signin", request.url))
  }

  // If user is authenticated and trying to access auth pages, redirect to dashboard
  if (session && (path === "/auth/signin" || path === "/auth/signup" || path === "/")) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/auth/:path*", "/api/docs/:path*", "/api/user/:path*", "/api/chat/:path*"],
}

