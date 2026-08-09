export const runtime = "edge";
import ResourceFinder from "@/components/ResourceFinder";
export default function FirmResources() {
  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Local resources</h1>
      <p className="muted" style={{ marginTop: 0 }}>Find police, hospitals, shelters, and recovery services near a client's address.</p>
      <ResourceFinder />
    </div>
  );
}
