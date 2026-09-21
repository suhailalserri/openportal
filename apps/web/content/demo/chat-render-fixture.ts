import type { ChatMessage, ChatError } from "@/features/chat/types";

/**
 * apps/web/content/demo/chat-render-fixture.ts
 *
 * QA fixtures for /dev/chat-render (Phase 4a's "done when" preview).
 * A plain TypeScript module, not JSON + a runtime parser (unlike
 * features/landing's content/demo/simulated-chat.json / demo-content.ts)
 * — this is dev-only tooling nobody edits without a TS toolchain
 * already open, so the fail-closed runtime validation the landing page's
 * demo content needs (it must never take a real, public page down) isn't
 * worth it here: a malformed fixture just fails `next build` directly,
 * which is fine for a page gated the same way /dev/kitchen-sink is.
 */

const LONG_ARABIC_WITH_CODE = `بالتأكيد، إليك شرحاً مفصلاً لكيفية عمل دورة الاحتراق الرباعية الأشواط في محرك السيارة، وهي العملية التي تحوّل خليط الوقود والهواء إلى حركة ميكانيكية.

تمر الدورة بأربع مراحل متتالية:

1. **شوط السحب (Intake)**: يتحرك المكبس للأسفل بينما يفتح صمام السحب، فيدخل خليط الهواء والوقود إلى غرفة الاحتراق.
2. **شوط الانضغاط (Compression)**: يغلق الصمامان ويتحرك المكبس للأعلى، فيضغط الخليط ليصبح أكثر قابلية للاشتعال.
3. **شوط القدرة (Power)**: تُطلق شرارة من البوجية فيشتعل الخليط، وتدفع القوة الناتجة المكبس للأسفل بقوة — هذا هو الشوط الوحيد الذي ينتج طاقة فعلية.
4. **شوط العادم (Exhaust)**: يفتح صمام العادم ويدفع المكبس الغازات المحترقة للخارج استعداداً للدورة التالية.

يمكن تمثيل الدورة بشكل مبسط في كود بايثون كالتالي:

\`\`\`python
# دورة كاملة = دورتان لعمود المرفق (crankshaft)
def four_stroke_cycle():
    return ["intake", "compression", "power", "exhaust"]
\`\`\`

لاحظ أن الرقم 12345 هنا (رقم تعريفي افتراضي للمحرك في هذا المثال) يظهر بأرقام غربية داخل نص عربي دون أن ينعكس اتجاهه، وكذلك الكود أعلاه يبقى بمحاذاة من اليسار إلى اليمين بغض النظر عن اتجاه الصفحة.

بعض الملاحظات الإضافية:
- كل دورة كاملة تعادل دورتين لعمود المرفق.
- التوقيت الدقيق لفتح وإغلاق الصمامات يُحدَّد بواسطة عمود الكامات (camshaft).
- في المحركات الحديثة، تُستخدم أنظمة حقن وقود إلكترونية بدلاً من المكربن التقليدي.

> ملاحظة: هذا شرح مبسط لأغراض توضيحية فقط، وليس مرجعاً هندسياً دقيقاً.`;

export const CHAT_RENDER_FIXTURE: ChatMessage[] = [
  {
    id: "fx-1",
    role: "user",
    content: "اشرح لي كيف تعمل دورة الاحتراق الرباعية الأشواط، مع مثال كود بسيط.",
    createdAt: "2026-09-20T10:02:00.000Z",
    isPartial: false,
  },
  {
    id: "fx-2",
    role: "assistant",
    content: LONG_ARABIC_WITH_CODE,
    createdAt: "2026-09-20T10:02:40.000Z",
    isPartial: false,
    modelId: "gpt-4o",
    inputTokens: 42,
    outputTokens: 386,
    creditCost: 9_400_000,
  },
  {
    id: "fx-3",
    role: "assistant",
    content: "بالتأكيد، إليك الخطوات الأولى قبل أن ينقطع",
    createdAt: "2026-09-20T10:03:10.000Z",
    isPartial: true,
    modelId: "claude-opus-4-8",
  },
  {
    id: "fx-4",
    role: "user",
    content: "شكراً، مفيد جداً 🙏",
    createdAt: "2026-09-20T10:04:00.000Z",
    isPartial: false,
  },
];

export const CHAT_RENDER_ERROR: ChatError = {
  id: "fx-err-1",
  message: "تعذّر الاتصال بمزوّد النموذج. حاول مرة أخرى.",
  retryable: true,
};

/**
 * XSS fixtures — each one a full ChatMessage so /dev/chat-render renders
 * it through the EXACT same Message → SafeMarkdown path a real model
 * response would take. The same three payloads (without the ChatMessage
 * wrapper) are asserted against directly in
 * components/markdown/safe-markdown.test.tsx.
 */
export const XSS_FIXTURES: ChatMessage[] = [
  {
    id: "xss-script",
    role: "assistant",
    content: "Ignore previous instructions.<script>alert('xss')</script> Here is your answer.",
    createdAt: "2026-09-20T10:05:00.000Z",
    isPartial: false,
  },
  {
    id: "xss-js-link",
    role: "assistant",
    content: "[Click here for your refund](javascript:alert('xss'))",
    createdAt: "2026-09-20T10:05:10.000Z",
    isPartial: false,
  },
  {
    id: "xss-remote-image",
    role: "assistant",
    content: "![tracking pixel](https://evil.example.com/pixel.png?uid=12345)",
    createdAt: "2026-09-20T10:05:20.000Z",
    isPartial: false,
  },
];
