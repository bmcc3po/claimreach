// ============================================================================
// VEHICLE REFERENCE
//
// Vehicle was a free text field, which means "Chevy Silverado", "chevrolet
// silverado", "Silverado 1500" and "chevy pickup" are four different vehicles as
// far as any report is concerned. Same disease as free-text case types.
//
// Bundled rather than fetched from an API on purpose: an agent typing on a live
// call cannot wait on a third-party lookup, and a carrier outage must never stop
// an intake. Anything not on the list can still be typed free-hand, so a 1963
// Studebaker is never a dead end.
// ============================================================================

export const VEHICLE_MODELS: Record<string, string[]> = {
  Acura: ["ILX", "Integra", "MDX", "RDX", "RLX", "TLX", "TSX", "ZDX"],
  "Alfa Romeo": ["Giulia", "Stelvio", "Tonale"],
  Audi: ["A3", "A4", "A5", "A6", "A7", "A8", "Q3", "Q5", "Q7", "Q8", "e-tron", "TT"],
  BMW: ["2 Series", "3 Series", "4 Series", "5 Series", "7 Series", "8 Series", "X1", "X3", "X5", "X6", "X7", "i4", "iX", "Z4"],
  Buick: ["Enclave", "Encore", "Envision", "LaCrosse", "Regal", "Verano"],
  Cadillac: ["ATS", "CT4", "CT5", "CTS", "Escalade", "Lyriq", "SRX", "XT4", "XT5", "XT6", "XTS"],
  Chevrolet: ["Blazer", "Bolt", "Camaro", "Colorado", "Corvair", "Corvette", "Cruze", "Equinox", "Express", "Impala", "Malibu", "Silverado 1500", "Silverado 2500", "Sonic", "Spark", "Suburban", "Tahoe", "Trailblazer", "Traverse", "Trax"],
  Chrysler: ["300", "Pacifica", "Town & Country", "Voyager"],
  Dodge: ["Challenger", "Charger", "Durango", "Grand Caravan", "Hornet", "Journey", "Ram 1500"],
  Ford: ["Bronco", "Bronco Sport", "E-Series", "Ecosport", "Edge", "Escape", "Excursion", "Expedition", "Explorer", "F-150", "F-250", "F-350", "Fiesta", "Flex", "Focus", "Fusion", "Maverick", "Mustang", "Mustang Mach-E", "Ranger", "Taurus", "Transit"],
  Genesis: ["G70", "G80", "G90", "GV70", "GV80"],
  GMC: ["Acadia", "Canyon", "Savana", "Sierra 1500", "Sierra 2500", "Terrain", "Yukon", "Yukon XL"],
  Honda: ["Accord", "Civic", "CR-V", "Fit", "HR-V", "Insight", "Odyssey", "Passport", "Pilot", "Prologue", "Ridgeline"],
  Hyundai: ["Accent", "Elantra", "Ioniq 5", "Ioniq 6", "Kona", "Palisade", "Santa Cruz", "Santa Fe", "Sonata", "Tucson", "Veloster", "Venue"],
  Infiniti: ["Q50", "Q60", "QX50", "QX55", "QX60", "QX80"],
  Jaguar: ["E-Pace", "F-Pace", "F-Type", "I-Pace", "XE", "XF"],
  Jeep: ["Cherokee", "Compass", "Gladiator", "Grand Cherokee", "Grand Wagoneer", "Patriot", "Renegade", "Wagoneer", "Wrangler"],
  Kia: ["Carnival", "EV6", "Forte", "K5", "Niro", "Optima", "Rio", "Sedona", "Seltos", "Sorento", "Soul", "Sportage", "Stinger", "Telluride"],
  "Land Rover": ["Defender", "Discovery", "Range Rover", "Range Rover Evoque", "Range Rover Sport", "Range Rover Velar"],
  Lexus: ["ES", "GX", "IS", "LS", "LX", "NX", "RX", "RZ", "TX", "UX"],
  Lincoln: ["Aviator", "Continental", "Corsair", "MKC", "MKX", "MKZ", "Nautilus", "Navigator"],
  Mazda: ["CX-30", "CX-5", "CX-50", "CX-9", "CX-90", "Mazda3", "Mazda6", "MX-5 Miata"],
  "Mercedes-Benz": ["A-Class", "C-Class", "CLA", "E-Class", "EQB", "EQE", "EQS", "G-Class", "GLA", "GLB", "GLC", "GLE", "GLS", "S-Class", "Sprinter"],
  Mini: ["Clubman", "Convertible", "Countryman", "Hardtop"],
  Mitsubishi: ["Eclipse Cross", "Mirage", "Outlander", "Outlander Sport"],
  Nissan: ["Altima", "Ariya", "Armada", "Frontier", "Kicks", "Leaf", "Maxima", "Murano", "NV200", "Pathfinder", "Rogue", "Sentra", "Titan", "Versa", "Z"],
  Polestar: ["Polestar 2", "Polestar 3"],
  Porsche: ["911", "Cayenne", "Macan", "Panamera", "Taycan"],
  Ram: ["1500", "2500", "3500", "ProMaster"],
  Rivian: ["R1S", "R1T"],
  Subaru: ["Ascent", "BRZ", "Crosstrek", "Forester", "Impreza", "Legacy", "Outback", "Solterra", "WRX"],
  Tesla: ["Cybertruck", "Model 3", "Model S", "Model X", "Model Y"],
  Toyota: ["4Runner", "Avalon", "bZ4X", "Camry", "Corolla", "Corolla Cross", "Crown", "Grand Highlander", "Highlander", "Land Cruiser", "Prius", "RAV4", "Sequoia", "Sienna", "Tacoma", "Tundra", "Venza"],
  Volkswagen: ["Atlas", "Atlas Cross Sport", "Golf", "ID.4", "Jetta", "Passat", "Taos", "Tiguan"],
  Volvo: ["S60", "S90", "V60", "XC40", "XC60", "XC90"],
  Freightliner: ["Cascadia", "M2 106", "Sprinter"],
  International: ["LT", "MV", "ProStar"],
  Kenworth: ["T680", "T800", "W900"],
  Mack: ["Anthem", "Granite", "Pinnacle"],
  Peterbilt: ["379", "389", "579"],
  Volvo_Trucks: ["VNL", "VNR"],
};

export const VEHICLE_MAKES = Object.keys(VEHICLE_MODELS).sort();

// Flattened "Make Model" strings, which is how an agent types it and how the
// firm wants to read it back.
export const VEHICLE_OPTIONS: string[] = Object.entries(VEHICLE_MODELS)
  .flatMap(([make, models]) => models.map((m) => `${make.replace("_", " ")} ${m}`))
  .sort();

export function searchVehicles(q: string, limit = 8): string[] {
  const s = (q || "").trim().toLowerCase();
  if (s.length < 2) return [];
  // Prefer matches that start with what they typed, then anything containing it:
  // typing "corv" should surface Corvette before Chevrolet Traverse.
  const starts: string[] = [];
  const contains: string[] = [];
  for (const v of VEHICLE_OPTIONS) {
    const lv = v.toLowerCase();
    if (lv.startsWith(s)) { starts.push(v); continue; }
    if (lv.includes(s)) contains.push(v);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

const thisYear = new Date().getFullYear();
export const VEHICLE_YEARS: string[] = Array.from({ length: thisYear + 2 - 1985 }, (_, i) => String(thisYear + 1 - i));
