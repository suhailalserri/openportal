import Link from "next/link";

export default function NotFound() {
  return (
    <html lang="ar" dir="rtl">
      <body style={{
        background: "#17130F", color: "#F7F4EF",
        fontFamily: "Inter, sans-serif",
        display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh",
      }}>
        <div style={{ textAlign: "center" }}>
          <p style={{
            fontFamily: "'Source Serif 4', Georgia, serif", fontSize: "4.5rem",
            color: "#D97757", lineHeight: 1, marginBottom: "0.5rem",
          }}>404</p>
          <p style={{ fontSize: "1.05rem", color: "#A79C8D", margin: "0.5rem 0 1.5rem" }}>الصفحة غير موجودة</p>
          <Link href="/ar/chat" style={{ color: "#D97757", textDecoration: "underline", fontSize: "0.9rem" }}>
            العودة للرئيسية
          </Link>
        </div>
      </body>
    </html>
  );
}
