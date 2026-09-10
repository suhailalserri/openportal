import { NextRequest, NextResponse } from "next/server";

const SUPPORTED_LOCALES = ["ar", "en"] as const;
const DEFAULT_LOCALE    = "ar";
const PUBLIC_PATHS      = ["/api", "/_next", "/favicon", "/public"];

function getLocaleFromRequest(request: NextRequest): string {
  // 1. Check URL segment
  const pathname = request.nextUrl.pathname;
  const segment  = pathname.split("/")[1];
  if (SUPPORTED_LOCALES.includes(segment as "ar" | "en")) return segment!;

  // 2. Check Accept-Language header
  const acceptLang = request.headers.get("accept-language") ?? "";
  if (acceptLang.startsWith("en")) return "en";

  return DEFAULT_LOCALE;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public/api paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Already has locale prefix
  const hasLocale = SUPPORTED_LOCALES.some(
    (l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`
  );

  if (!hasLocale) {
    const locale  = getLocaleFromRequest(request);
    const newPath = pathname === "/" ? `/${locale}/chat` : `/${locale}${pathname}`;
    return NextResponse.redirect(new URL(newPath, request.url));
  }

  // This app uses a custom middleware instead of next-intl's own createMiddleware,
  // so next-intl never receives the locale automatically. next-intl's server APIs
  // (including requestLocale in i18n/request.ts) read the active locale from the
  // `x-next-intl-locale` request header, which its own middleware would normally
  // set — since we're not using that middleware, we set it here ourselves.
  const segment  = pathname.split("/")[1] ?? DEFAULT_LOCALE;
  const response = NextResponse.next();
  response.headers.set("x-next-intl-locale", segment);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.svg).*)"],
};
