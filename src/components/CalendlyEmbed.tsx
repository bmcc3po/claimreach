"use client";

// Live Calendly inline embed. `slug` defaults to the org link; per-agent links
// can be passed in later (e.g. calendly.com/<agent>).
export default function CalendlyEmbed({
  slug = "brettmichael",
  name,
  email,
}: {
  slug?: string;
  name?: string;
  email?: string;
}) {
  const params = new URLSearchParams();
  if (name) params.set("name", name);
  if (email) params.set("email", email);
  params.set("hide_gdpr_banner", "1");
  const url = `https://calendly.com/${slug}?${params.toString()}`;

  return (
    <div className="cal-wrap">
      <div className="cal-head">
        <strong>Schedule the case manager call</strong>
        <div className="muted">Book a time with the claimant before ending the call.</div>
      </div>
      <iframe src={url} title="Schedule with case manager" loading="lazy" />
    </div>
  );
}
