"use client";
import { useState, isValidElement } from "react";
import { useTranslations } from "next-intl";
import { Copy, Check } from "lucide-react";

interface CodeBlockProps {
  className?: string;
  children?:  React.ReactNode;
}

// react-markdown hands raw <pre><code> elements to this override. The
// language rehype-highlight detected comes through as a `language-xxx`
// class on the inner <code> — read it back out for the label, rather than
// guessing or hardcoding a language name.
function extractLanguage(children: React.ReactNode): string | null {
  if (isValidElement(children)) {
    const props = children.props as { className?: string };
    const match = props.className?.match(/language-(\w+)/);
    return match?.[1] ?? null;
  }
  return null;
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return extractText(props.children);
  }
  return "";
}

export function CodeBlock({ children }: CodeBlockProps) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);
  const language = extractLanguage(children);
  const text = extractText(children);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative group/code my-2 rounded-xl overflow-hidden border border-slate-700 bg-[color:var(--bg-base)]" dir="ltr">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700 bg-slate-900/40">
        <span className="text-[11px] font-mono text-slate-500 select-none">
          {language ?? "text"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-200
                     opacity-0 group-hover/code:opacity-100 focus-visible:opacity-100 transition-opacity"
          aria-label={t("chat.copy")}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? t("chat.copied") : t("chat.copy")}
        </button>
      </div>
      <pre className="!m-0 !bg-transparent overflow-x-auto p-3 text-[13px] leading-relaxed">
        {children}
      </pre>
    </div>
  );
}
