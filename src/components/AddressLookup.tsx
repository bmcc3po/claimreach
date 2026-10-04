"use client";
import PlaceField from "./calls/PlaceField";
import type { ParsedAddress } from "@/lib/place-address";
export type { ParsedAddress } from "@/lib/place-address";

export default function AddressLookup({ value, near, onText, onPick, label = "Street address" }: {
  value?: string; near?: string; onText: (text: string) => void;
  onPick: (address: ParsedAddress) => void; label?: string;
}) {
  return <PlaceField kind="address" streetOnly value={value || ""} near={near} label={label}
    placeholder="Start typing the street address" onChange={onText} onAddress={onPick} />;
}

