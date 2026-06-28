// ============================================================================
// ClaimReach — CANONICAL FIELD DICTIONARY (the load-bearing spine).
// Every field has ONE permanent ID that never changes. The intake spine,
// webhook templates, REST API, docs, retainer autofill, and Grievous/Integrity
// all reference these IDs. Case types = universal spine + a case preset.
//
// DO NOT rename an `id` once shipped. Add new ones; never repurpose old ones.
// ============================================================================
import type { Field } from "@/lib/questionnaire";

export type CanonGroup =
  | "routing" | "identity" | "contact" | "authority" | "incident"
  | "treatment" | "gates" | "damages" | "emergency" | "insurance";

export interface CanonField {
  id: string;                 // PERMANENT canonical id
  label: string;
  kind: Field["kind"];
  group: CanonGroup;
  options?: string[];
  sensitive?: boolean;        // masked / restricted (e.g. SSN)
  gateType?: Field["gateType"];
  vital?: boolean;
}

// ----------------------------------------------------------------------------
// PART 1 — UNIVERSAL SPINE (on every case, every type)
// ----------------------------------------------------------------------------
export const SPINE: CanonField[] = [
  // A. Record / Routing
  { id: "cr_lead_no", label: "ClaimReach lead #", kind: "text", group: "routing" },
  { id: "vendor_lead_id", label: "Vendor / source lead #", kind: "text", group: "routing" },
  { id: "external_id", label: "External system ID", kind: "text", group: "routing" },
  { id: "marketing_source", label: "Marketing source", kind: "select", group: "routing" },
  { id: "campaign_name", label: "Campaign name", kind: "text", group: "routing" },
  { id: "case_type", label: "Case type", kind: "select", group: "routing" },
  { id: "referring_attorney", label: "Referring attorney", kind: "text", group: "routing" },
  { id: "handling_attorney", label: "Handling attorney", kind: "text", group: "routing" },
  { id: "law_firm", label: "Law firm / client", kind: "text", group: "routing" },
  { id: "intake_agent", label: "Intake agent", kind: "text", group: "routing" },
  { id: "qa_agent", label: "QA agent", kind: "text", group: "routing" },
  { id: "case_manager", label: "Case manager", kind: "text", group: "routing" },
  { id: "office_location", label: "Office location", kind: "select", group: "routing" },
  { id: "case_tier", label: "Case tier / rating", kind: "select", group: "routing" },
  { id: "lead_status", label: "Status", kind: "select", group: "routing" },
  { id: "date_referred", label: "Date referred / received", kind: "date", group: "routing" },
  { id: "esign_signed_date", label: "E-sign signed date", kind: "date", group: "routing" },
  { id: "signed_contract_received", label: "Signed contract received", kind: "bool", group: "routing" },
  { id: "source_lead_link", label: "Source system lead link", kind: "text", group: "routing" },

  // B. Claimant Identity
  { id: "claimant_first_name", label: "First name", kind: "text", group: "identity" },
  { id: "claimant_last_name", label: "Last name", kind: "text", group: "identity" },
  { id: "claimant_dob", label: "Date of birth", kind: "date", group: "identity" },
  { id: "claimant_ssn", label: "SSN", kind: "text", group: "identity", sensitive: true },
  { id: "claimant_gender", label: "Gender", kind: "select", group: "identity", options: ["Male", "Female", "Other", "Prefer not to say"] },
  { id: "claimant_marital_status", label: "Marital status", kind: "select", group: "identity", options: ["Single", "Married", "Divorced", "Widowed", "Separated"] },
  { id: "claimant_language", label: "Preferred language", kind: "select", group: "identity", options: ["English", "Spanish", "Other"] },

  // C. Contact
  { id: "claimant_phone", label: "Primary phone", kind: "phone", group: "contact" },
  { id: "claimant_phone_alt", label: "Alternate phone", kind: "phone", group: "contact" },
  { id: "claimant_email", label: "Email", kind: "email", group: "contact" },
  { id: "mail_address1", label: "Address line 1", kind: "text", group: "contact" },
  { id: "mail_address2", label: "Address line 2", kind: "text", group: "contact" },
  { id: "mail_city", label: "City", kind: "text", group: "contact" },
  { id: "mail_state", label: "State", kind: "select", group: "contact" },
  { id: "mail_zip", label: "ZIP", kind: "text", group: "contact" },
  { id: "mail_county", label: "County", kind: "text", group: "contact" },
  { id: "preferred_contact_method", label: "Preferred contact method", kind: "select", group: "contact", options: ["Phone", "Text", "Email"] },
  { id: "preferred_contact_time", label: "Preferred contact time", kind: "text", group: "contact" },
  { id: "client_time_zone", label: "Time zone", kind: "select", group: "contact", options: ["Eastern", "Central", "Mountain", "Pacific", "Alaska", "Hawaii"] },

  // D. Representation / Authority
  { id: "signing_for_self", label: "Signing for self?", kind: "bool", group: "authority" },
  { id: "capacity", label: "Signer capacity", kind: "select", group: "authority", options: ["Self", "POA", "Next of kin", "Guardian", "Executor of estate", "Conservator"] },
  { id: "obo_relationship", label: "Relationship to claimant (if OBO)", kind: "text", group: "authority" },
  { id: "obo_signer_name", label: "Signer name (if OBO)", kind: "text", group: "authority" },
  { id: "is_deceased", label: "Claimant deceased?", kind: "bool", group: "authority" },
  { id: "date_of_death", label: "Date of death", kind: "date", group: "authority" },
  { id: "estate_opened", label: "Estate opened?", kind: "bool", group: "authority" },

  // E. Incident / Injury Core
  { id: "date_of_incident", label: "Date of incident / first exposure", kind: "date", group: "incident", vital: true },
  { id: "incident_state", label: "State where it occurred", kind: "select", group: "incident" },
  { id: "qualified_injury", label: "Qualified injury / diagnosis", kind: "select", group: "incident", vital: true },
  { id: "date_of_diagnosis", label: "Date of diagnosis", kind: "date", group: "incident" },
  { id: "injury_description", label: "Injury / what happened", kind: "longtext", group: "incident" },
  { id: "injury_severity", label: "Severity", kind: "select", group: "incident", options: ["Minor", "Moderate", "Severe", "Catastrophic", "Death"] },

  // F. Treatment
  { id: "received_treatment", label: "Received medical treatment?", kind: "bool", group: "treatment" },
  { id: "first_treatment_date", label: "First date of treatment", kind: "date", group: "treatment" },
  { id: "treating_provider", label: "Treating provider / facility", kind: "text", group: "treatment" },
  { id: "hospitalized", label: "Hospitalized?", kind: "bool", group: "treatment" },
  { id: "ongoing_treatment", label: "Still treating?", kind: "bool", group: "treatment" },

  // G. Legal / Eligibility Gates
  { id: "currently_represented", label: "Currently represented by another attorney?", kind: "gate", group: "gates", gateType: "dq" },
  { id: "prior_signup", label: "Prior signup for this case?", kind: "gate", group: "gates", gateType: "dq" },
  { id: "sol_eligible", label: "Within statute of limitations?", kind: "bool", group: "gates" },
  { id: "sol_deadline", label: "SOL deadline", kind: "date", group: "gates" },
  { id: "prior_lawsuits", label: "Prior injury lawsuits/claims?", kind: "bool", group: "gates" },
  { id: "bankruptcy", label: "Active/prior bankruptcy?", kind: "select", group: "gates", options: ["No", "Chapter 7", "Chapter 13", "Discharged", "Active"] },
  { id: "govt_benefits", label: "Medicare / Medicaid / VA / workers comp?", kind: "multiselect", group: "gates", options: ["Medicare", "Medicaid", "VA", "Workers comp", "None"] },

  // H. Damages
  { id: "medical_bills_amount", label: "Medical bills to date", kind: "int", group: "damages" },
  { id: "lost_wages", label: "Lost wages / missed work?", kind: "bool", group: "damages" },
  { id: "employer_name", label: "Employer", kind: "text", group: "damages" },
  { id: "property_damage", label: "Property damage?", kind: "bool", group: "damages" },
  { id: "has_photos", label: "Photos/video available?", kind: "multiselect", group: "damages", options: ["Injuries", "Scene", "Property", "Product", "None"] },
  { id: "has_proof", label: "Proof of purchase/ownership/use?", kind: "multiselect", group: "damages", options: ["Receipt", "Records", "Product", "Photos", "None"] },

  // I. Emergency Contact
  { id: "ec_name", label: "Emergency contact name", kind: "text", group: "emergency" },
  { id: "ec_relationship", label: "EC relationship", kind: "text", group: "emergency" },
  { id: "ec_phone", label: "EC phone", kind: "phone", group: "emergency" },
  { id: "ec_email", label: "EC email", kind: "email", group: "emergency" },
  { id: "ec_permission_to_discuss", label: "EC permission to discuss", kind: "bool", group: "emergency" },

  // J. Insurance / Policy (first-party core; blank on most third-party)
  { id: "policy_holder_name", label: "Policyholder name", kind: "text", group: "insurance" },
  { id: "insurance_carrier", label: "Insurance carrier", kind: "text", group: "insurance" },
  { id: "policy_number", label: "Policy number", kind: "text", group: "insurance" },
  { id: "claim_number", label: "Insurance claim number", kind: "text", group: "insurance" },
  { id: "policy_type", label: "Policy type", kind: "select", group: "insurance", options: ["Homeowners", "Auto", "Commercial", "Renters", "Flood", "Wind/Hail", "Other"] },
  { id: "date_of_loss", label: "Date of loss", kind: "date", group: "insurance" },
  { id: "loss_type", label: "Type of loss", kind: "select", group: "insurance", options: ["Hail", "Wind", "Water", "Fire", "Flood", "Theft", "Other"] },
  { id: "claim_filed_date", label: "Date claim filed with carrier", kind: "date", group: "insurance" },
  { id: "claim_status", label: "Carrier claim status", kind: "select", group: "insurance", options: ["Open", "Underpaid", "Denied", "Closed", "Delayed"] },
  { id: "denial_date", label: "Date of denial", kind: "date", group: "insurance" },
  { id: "amount_claimed", label: "Amount claimed", kind: "int", group: "insurance" },
  { id: "amount_paid", label: "Amount carrier paid", kind: "int", group: "insurance" },
  { id: "public_adjuster_involved", label: "Public adjuster involved?", kind: "bool", group: "insurance" },
];

// quick lookup
export const SPINE_BY_ID: Record<string, CanonField> = Object.fromEntries(SPINE.map((f) => [f.id, f]));

// ----------------------------------------------------------------------------
// PART 2 — CASE-TYPE PRESETS (extra fields layered on the spine)
// Each preset lists only its SPECIFIC extras. Spine is always included.
// `gates` = default DQ gates so a new campaign is qualification-ready.
// ----------------------------------------------------------------------------
export interface CasePreset {
  key: string;
  label: string;
  family: "third_party" | "first_party";
  defaultGates: string[];     // canonical gate ids auto-included
  extras: CanonField[];
}

const G = (id: string, label: string, kind: Field["kind"], options?: string[]): CanonField =>
  ({ id, label, kind, group: "incident", options });

export const CASE_PRESETS: CasePreset[] = [
  { key: "mva", label: "MVA / Motor Vehicle Accident", family: "third_party", defaultGates: ["currently_represented", "prior_signup"], extras: [
    G("mva_role", "Role", "select", ["Driver", "Passenger", "Pedestrian", "Cyclist", "Motorcyclist"]),
    G("collision_type", "Collision type", "select", ["Rear-end", "Head-on", "Side/T-bone", "Rollover", "Multi-vehicle", "Hit and run"]),
    G("at_fault_party", "At-fault party", "text"), G("police_report", "Police report filed?", "bool"),
    G("police_report_no", "Police report #", "text"), G("airbags_deployed", "Airbags deployed?", "bool"),
    G("seatbelt_worn", "Seatbelt worn?", "bool"), G("ambulance_from_scene", "Ambulance from scene?", "bool"),
    G("er_same_day", "ER same day?", "bool"), G("vehicle_drivable", "Vehicle drivable after?", "bool"),
    G("claimant_insurance", "Your insurance carrier", "text"), G("pip_available", "PIP available?", "bool"),
    G("at_fault_insurance", "At-fault insurance carrier", "text"), G("commercial_vehicle_involved", "Commercial vehicle involved?", "bool"),
  ]},
  { key: "big_trucking", label: "Big Trucking / Commercial Vehicle", family: "third_party", defaultGates: ["currently_represented", "prior_signup"], extras: [
    G("truck_company", "Trucking company", "text"), G("truck_type", "Truck type", "select", ["Semi", "Box truck", "Tanker", "Other"]),
    G("dot_number", "DOT number", "text"), G("commercial_driver", "Commercial driver?", "bool"),
    G("cargo_involved", "Cargo involved?", "bool"), G("fatality_involved", "Fatality involved?", "bool"),
  ]},
  { key: "tbi", label: "TBI / Traumatic Brain Injury", family: "third_party", defaultGates: ["currently_represented", "prior_signup"], extras: [
    G("loss_of_consciousness", "Loss of consciousness?", "bool"), G("loc_duration", "LOC duration", "text"),
    G("gcs_score", "Glasgow Coma score", "text"), G("imaging_done", "Imaging done", "multiselect", ["CT", "MRI", "None"]),
    G("cognitive_symptoms", "Cognitive symptoms", "multiselect", ["Memory", "Concentration", "Headaches", "Mood", "Speech", "Vision"]),
    G("tbi_diagnosed_by", "Diagnosed by", "text"), G("prior_head_injury", "Prior head injury?", "bool"),
  ]},
  { key: "medical_device", label: "Medical Device Mass Tort", family: "third_party", defaultGates: ["currently_represented", "prior_signup", "prior_lawsuits"], extras: [
    G("device_name", "Device name", "select"), G("device_manufacturer", "Manufacturer", "text"),
    G("device_model", "Model", "text"), G("implant_date", "Implant date", "date"),
    G("implanting_facility", "Implanting facility", "text"), G("device_still_implanted", "Still implanted?", "bool"),
    G("explant_date", "Explant date", "date"), G("revision_surgery", "Revision surgery?", "bool"),
    G("device_failure_type", "Failure type", "multiselect", ["Migration", "Fracture", "Infection", "Perforation", "Other"]),
    G("device_lot_number", "Lot number", "text"),
  ]},
  { key: "pharma", label: "Pharma / Drug Mass Tort", family: "third_party", defaultGates: ["currently_represented", "prior_signup", "prior_lawsuits"], extras: [
    G("drug_name", "Drug name", "select"), G("drug_manufacturer", "Manufacturer", "text"),
    G("use_start_date", "Use start date", "date"), G("use_end_date", "Use end date", "date"),
    G("use_duration", "Duration of use", "text"), G("use_frequency", "Frequency of use", "text"),
    G("age_at_first_use", "Age at first use", "int"), G("prescribed_or_otc", "Prescribed or OTC?", "select", ["Prescribed", "OTC"]),
    G("prescribing_provider", "Prescribing provider", "text"), G("dosage", "Dosage", "text"),
    G("proof_of_use", "Proof of use", "multiselect", ["Pharmacy records", "Bottles", "Rx", "None"]),
  ]},
  { key: "consumer_product", label: "Consumer Product Mass Tort", family: "third_party", defaultGates: ["currently_represented", "prior_signup", "prior_lawsuits"], extras: [
    G("product_name", "Product name", "select"), G("product_brand", "Brand", "text"),
    G("product_manufacturer", "Manufacturer", "text"), G("purchase_date", "Purchase date", "date"),
    G("use_start_date", "Use start date", "date"), G("use_frequency", "Frequency", "text"),
    G("use_duration", "Duration", "text"), G("age_at_first_use", "Age at first use", "int"),
    G("still_have_product", "Still have product?", "bool"), G("proof_of_purchase", "Proof of purchase", "multiselect", ["Receipt", "Photos", "Account", "None"]),
    G("exposure_route", "Exposure route", "text"),
  ]},
  { key: "environmental", label: "Environmental / Toxic Exposure", family: "third_party", defaultGates: ["currently_represented", "prior_signup", "prior_lawsuits"], extras: [
    G("exposure_source", "Exposure source", "select", ["Water", "Foam/AFFF", "Occupational", "Air", "Soil"]),
    G("exposure_location", "Exposure location", "text"), G("exposure_start_date", "Exposure start", "date"),
    G("exposure_end_date", "Exposure end", "date"), G("exposure_duration_years", "Years of exposure", "int"),
    G("residence_at_location", "Resided at location?", "bool"), G("occupational_exposure", "Occupational exposure?", "bool"),
    G("military_service", "Military service?", "bool"), G("service_dates", "Service dates", "text"),
  ]},
  { key: "medmal", label: "Medical Malpractice", family: "third_party", defaultGates: ["currently_represented", "prior_signup"], extras: [
    G("provider_name", "Provider name", "text"), G("facility_name", "Facility name", "text"),
    G("procedure_type", "Procedure type", "text"), G("date_of_malpractice", "Date of malpractice", "date"),
    G("malpractice_type", "Type", "select", ["Misdiagnosis", "Surgical error", "Medication error", "Birth injury", "Other"]),
    G("injury_from_malpractice", "Resulting injury", "longtext"), G("subsequent_treatment", "Subsequent treatment", "text"),
    G("expert_review_done", "Expert review done?", "bool"),
  ]},
  { key: "birth_injury", label: "Birth Injury", family: "third_party", defaultGates: ["currently_represented", "prior_signup"], extras: [
    G("child_name", "Child name", "text"), G("child_dob", "Child DOB", "date"),
    G("delivery_facility", "Delivery facility", "text"), G("delivery_type", "Delivery type", "select", ["Vaginal", "C-section"]),
    G("birth_injury_type", "Injury type", "select", ["HIE", "Cerebral palsy", "Erb's palsy", "Brachial plexus", "Other"]),
    G("apgar_score", "Apgar score", "text"), G("nicu_admission", "NICU admission?", "bool"),
    G("developmental_diagnosis", "Developmental diagnosis", "text"), G("mother_name", "Mother name", "text"),
  ]},
  { key: "sex_abuse", label: "Sex Abuse Mass Tort", family: "third_party", defaultGates: ["currently_represented", "prior_signup"], extras: [
    G("institution_name", "Institution name", "text"), G("institution_type", "Institution type", "select", ["Religious", "Juvenile detention", "School", "Scouting", "Foster care", "Other"]),
    G("abuse_location", "Location", "text"), G("abuse_start_date", "Abuse start", "date"),
    G("abuse_end_date", "Abuse end", "date"), G("claimant_age_at_abuse", "Age at time", "int"),
    G("perpetrator_known", "Perpetrator known?", "bool"), G("reported_at_time", "Reported at the time?", "bool"),
    G("prior_disclosure", "Prior disclosure?", "bool"), G("lookback_window_eligible", "Lookback window eligible?", "bool"),
  ]},
  { key: "premises", label: "Slip & Fall / Premises Liability", family: "third_party", defaultGates: ["currently_represented", "prior_signup"], extras: [
    G("premises_type", "Premises type", "text"), G("premises_owner", "Premises owner", "text"),
    G("hazard_type", "Hazard type", "text"), G("incident_reported", "Incident reported?", "bool"),
    G("incident_report_no", "Incident report #", "text"), G("witnesses_present", "Witnesses present?", "bool"),
    G("surveillance_exists", "Surveillance exists?", "bool"), G("footwear", "Footwear", "text"),
  ]},
  { key: "negligent_security", label: "Negligent Security (premises)", family: "third_party", defaultGates: ["currently_represented", "prior_signup"], extras: [
    G("premises_type", "Premises type", "select", ["Apartment", "Retail", "Casino", "Bar", "Parking", "Hotel", "Gas station"]),
    G("premises_name", "Premises name", "text"), G("premises_owner", "Premises owner", "text"),
    G("property_management_co", "Property management co.", "text"),
    G("assault_type", "Assault type", "multiselect", ["Shooting", "Stabbing", "Robbery", "Assault", "Sexual assault", "Carjacking"]),
    G("perpetrator_caught", "Perpetrator caught?", "bool"),
    G("security_present", "Security present?", "select", ["None", "Inadequate", "Present"]),
    G("security_type_expected", "Security expected", "multiselect", ["Guard", "Cameras", "Lighting", "Gates", "Access control"]),
    G("prior_crime_at_location", "Prior crime at location?", "bool"),
    G("police_called", "Police called?", "bool"), G("police_report_no", "Police report #", "text"),
    G("criminal_case_filed", "Criminal case filed?", "bool"), G("time_of_incident", "Time of incident", "text"),
    G("lighting_conditions", "Lighting conditions", "text"), G("witnesses_present", "Witnesses present?", "bool"),
    G("surveillance_exists", "Surveillance exists?", "bool"),
  ]},
  { key: "workplace", label: "Workplace / Labor", family: "third_party", defaultGates: ["currently_represented", "prior_signup"], extras: [
    G("employer_name", "Employer", "text"), G("job_title", "Job title", "text"),
    G("injury_on_job", "Injury on the job?", "bool"), G("osha_reported", "OSHA reported?", "bool"),
    G("workers_comp_filed", "Workers comp filed?", "bool"), G("wc_claim_no", "WC claim #", "text"),
    G("third_party_liable", "Third party liable?", "bool"), G("safety_equipment_provided", "Safety equipment provided?", "bool"),
  ]},
  // ---- FIRST-PARTY (you vs YOUR insurer) ----
  { key: "property_first_party", label: "Property Damage — First-Party", family: "first_party", defaultGates: ["currently_represented", "prior_signup"], extras: [
    G("property_address", "Property address", "text"), G("property_type", "Property type", "select", ["Single-family", "Multi-family", "Commercial", "Mobile home"]),
    G("damage_type", "Damage type", "multiselect", ["Roof", "Siding", "Interior", "Water", "Structural", "Contents"]),
    G("inspection_done", "Inspection done?", "bool"), G("inspection_date", "Inspection date", "date"),
    G("contractor_estimate", "Contractor estimate?", "bool"), G("estimate_amount", "Estimate amount", "int"),
    G("carrier_inspection_done", "Carrier inspected?", "bool"), G("carrier_estimate_amount", "Carrier estimate", "int"),
    G("underpaid_amount", "Underpaid amount", "int"), G("mortgage_on_property", "Mortgage on property?", "bool"),
    G("still_own_property", "Still own property?", "bool"), G("repairs_started", "Repairs started?", "bool"),
    G("photos_of_damage", "Photos of damage", "multiselect", ["Roof", "Interior", "Exterior", "Contents", "None"]),
  ]},
  { key: "bad_faith", label: "Insurance Bad Faith / Breach of Contract", family: "first_party", defaultGates: ["currently_represented", "prior_signup"], extras: [
    G("bad_faith_conduct", "Bad faith conduct", "multiselect", ["Wrongful denial", "Lowball", "Delay", "Failure to investigate", "Misrepresentation"]),
    G("denial_reason_given", "Denial reason given", "longtext"), G("appeal_filed", "Appeal filed?", "bool"),
    G("appeal_outcome", "Appeal outcome", "text"), G("communications_documented", "Communications documented?", "bool"),
    G("coverage_in_dispute", "Coverage in dispute", "text"), G("demand_made", "Demand made?", "bool"),
    G("demand_amount", "Demand amount", "int"), G("carrier_response", "Carrier response", "text"),
    G("prior_claims_same_policy", "Prior claims on same policy?", "bool"),
  ]},
  { key: "storm_cat", label: "Storm / CAT Event", family: "first_party", defaultGates: ["currently_represented", "prior_signup"], extras: [
    G("storm_name", "Storm name", "text"), G("cat_event_date", "CAT event date", "date"),
    G("fema_claim", "FEMA claim?", "bool"), G("fema_claim_no", "FEMA claim #", "text"),
    G("evacuated", "Evacuated?", "bool"), G("total_loss", "Total loss?", "bool"),
    G("aob_signed", "Assignment of benefits signed?", "bool"), G("prior_storm_claims", "Prior storm claims?", "bool"),
  ]},
];

export const PRESET_BY_KEY: Record<string, CasePreset> = Object.fromEntries(CASE_PRESETS.map((p) => [p.key, p]));

// Full canonical field set for a case type = spine + preset extras.
export function canonicalFieldsFor(caseKey: string): CanonField[] {
  const preset = PRESET_BY_KEY[caseKey];
  return preset ? [...SPINE, ...preset.extras] : [...SPINE];
}

// Every known canonical id (spine + all preset extras), de-duped — for docs + mapping.
export function allCanonicalIds(): CanonField[] {
  const seen = new Map<string, CanonField>();
  for (const f of SPINE) seen.set(f.id, f);
  for (const p of CASE_PRESETS) for (const f of p.extras) if (!seen.has(f.id)) seen.set(f.id, f);
  return [...seen.values()];
}
