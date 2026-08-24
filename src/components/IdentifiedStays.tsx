import { stayRangeLabel, type IdentifiedProperty } from "@/lib/property-tool";

// One stay list. /m6 file, firm file, and staff /leads/[id] all read the
// same property_identifications rows.

export default function IdentifiedStays({
  properties,
  title = "Identified properties",
}: {
  properties: IdentifiedProperty[];
  title?: string;
}) {
  if (!properties.length) return null;
  return (
    <section className="m6-card m6-identified">
      <h2>{title}</h2>
      <ul className="m6-points">
        {properties.map((p) => {
          const where = [p.street || p.address, p.city, p.state, p.zip].filter(Boolean).join(", ");
          const when = stayRangeLabel(p.stay_from, p.stay_to);
          return (
            <li key={p.id}>
              <div>
                <span className="m6-point-val">{p.name || "Property"}</span>
                {where && <span className="m6-point-lab">{where}</span>}
                <span className="m6-point-lab">
                  Remembered as {p.remembered_brand || "not noted"}
                  {p.current_brand ? ` · current flag ${p.current_brand}` : ""}
                  {when ? ` · ${when}` : ""}
                </span>
                {p.brand_mismatch && (
                  <span className="m6-id-flag">Remembered brand differs from the current flag</span>
                )}
                {p.history?.map((h, i) => (
                  <span key={`${p.id}-h-${i}`} className="m6-point-lab">
                    Recorded {h.from ?? "?"}{h.to && h.to !== h.from ? `–${h.to}` : ""}: {h.brand || "brand not noted"}
                    {h.llc ? ` · ${h.llc}` : ""}
                    {h.address ? ` · ${h.address}` : ""}
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
