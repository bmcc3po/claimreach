export const runtime = "edge";

// Public signing layout. Loads signature-style fonts for the typed-signature
// option and keeps the page chrome minimal (no app nav).
export default function SignLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&family=Great+Vibes&family=Sacramento&display=swap" rel="stylesheet" />
      {children}
    </>
  );
}
