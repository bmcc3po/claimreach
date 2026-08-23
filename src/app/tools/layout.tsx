export const runtime = "edge";
export const dynamic = "force-dynamic";

// Public LawRuler-agent tools. No app nav. Token check lives on each page
// (fail closed 404). Middleware must treat /tools as public like /sign.
export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
