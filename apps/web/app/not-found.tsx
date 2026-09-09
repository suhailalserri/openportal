import Link from "next/link";

export default function NotFound() {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ background: "#0F172A", color: "#F8FAFC", fontFamily: "sans-serif",
        display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "4rem", color: "#2563EB" }}>404</h1>
          <p style={{ fontSize: "1.2rem", color: "#94A3B8", margin: "1rem 0" }}>الصفحة غير موجودة</p>
          <Link href="/ar/chat" style={{ color: "#2563EB", textDecoration: "underline" }}>
            العودة للرئيسية
          </Link>
        </div>
      </body>
    </html>
  );
}
