// ============================================================================
// ClaimReach — Motel Trafficking intake questionnaire, as data.
// Single source of truth for the intake form. Maps every question from the
// TMP questionnaire onto lead-level (once) vs property-level (repeatable).
//
// Field "scope": 'lead' renders once in the spine; 'property' renders inside
// each property card. "kind" drives the input widget. "script" = read-aloud
// verbatim to claimant. "agentNote" = agent-only, NOT read to claimant.
// "gate" = a checkpoint the agent must acknowledge (DQ / supervisor / safety).
// ============================================================================

export type FieldKind =
  | "text" | "longtext" | "bool" | "select" | "multiselect"
  | "int" | "monthyear" | "script" | "section" | "gate" | "property_lookup";

export interface Field {
  id: string;            // db column (or synthetic for script/section/gate)
  scope: "lead" | "property";
  kind: FieldKind;
  label: string;
  options?: string[];
  script?: string;       // verbatim read-aloud text
  agentNote?: string;    // agent-only guidance, never read aloud
  vital?: boolean;       // highlighted as vital in the original
  gateType?: "dq" | "supervisor" | "safety" | "end_intake";
}

export const INTAKE: Field[] = [
  // ---- OPENING (verbatim) -------------------------------------------------
  { id: "s_open", scope: "lead", kind: "section", label: "Opening" },
  {
    id: "script_intro", scope: "lead", kind: "script", label: "Intro (read verbatim)",
    script:
      "Thank you. My name is ___. I'm calling from Turnbull, Moak, and Pendergrass, the law firm handling your claim. Before we begin, are you in a safe place to speak right now?",
    agentNote: "If NOT in a safe place: schedule a callback and stop here.",
  },
  {
    id: "safe_to_speak", scope: "lead", kind: "gate", label: "Is the claimant in a safe place to speak?",
    gateType: "safety",
    agentNote: "If no, schedule callback. Do not proceed with intake.",
  },
  {
    id: "script_reassure", scope: "lead", kind: "script", label: "Reassurance (read verbatim)",
    script:
      "My team focuses specifically on hotel trafficking cases. Anything you share stays confidential between you and the law firm. My role is not to judge or form opinions, only to gather the facts so the legal team can determine the best next steps. There's no need to censor yourself. If you need to pause, take a break, or skip any question, just let me know. There are no right or wrong answers. If a question doesn't apply, just tell me and we'll keep moving.",
  },

  // ---- THRESHOLD / DQ GATES ----------------------------------------------
  { id: "s_threshold", scope: "lead", kind: "section", label: "Threshold" },
  {
    id: "g_victim", scope: "lead", kind: "bool", vital: true,
    label: "Were you or a loved one a victim of sex trafficking or forced prostitution at any hotel or motel?",
  },
  {
    id: "caller_is_self", scope: "lead", kind: "bool", vital: true,
    label: "Are you the person this happened to?",
    agentNote: "If calling about someone else, confirm POA / next-of-kin authority before continuing.",
  },
  { id: "caller_relationship", scope: "lead", kind: "text", label: "If not self: relationship to the claimant" },
  { id: "poa_nok_confirmed", scope: "lead", kind: "bool", label: "POA / NOK authority confirmed" },
  {
    id: "g_at_hotel", scope: "lead", kind: "gate", gateType: "end_intake", vital: true,
    label: "Did this occur at a hotel or motel?",
    agentNote: "If NO: end intake.",
  },
  {
    id: "g_can_identify", scope: "lead", kind: "gate", gateType: "supervisor", vital: true,
    label: "Can you identify at least one specific hotel or motel where this occurred?",
    agentNote: "If NO: DQ — call supervisor before proceeding.",
  },

  // ---- CONTROL / COERCION (once) -----------------------------------------
  { id: "s_control", scope: "lead", kind: "section", label: "Control / Coercion",
    agentNote: "DO NOT LET THEM RAMBLE. Keep to the questions." },
  { id: "was_controlled", scope: "lead", kind: "bool", label: "Was someone else controlling or forcing you to engage in sex acts?" },
  { id: "control_methods", scope: "lead", kind: "multiselect", label: "How were you controlled? (select all)",
    agentNote: "DO NOT READ THE LIST. Mark what they describe.",
    options: ["Physical force","Threats","Drugs","Debt bondage","Isolation","Controlled money","Controlled ID/documents","Controlled phone","Emotional/psychological","Other"] },
  { id: "could_refuse", scope: "lead", kind: "bool", label: "Were you able to refuse without consequences?" },
  { id: "had_phone_money_id", scope: "lead", kind: "bool", label: "Did you have access to your own phone, money, and ID during this time?" },

  // ---- RECRUITMENT (once) -------------------------------------------------
  { id: "s_recruit", scope: "lead", kind: "section", label: "Recruitment" },
  { id: "met_how", scope: "lead", kind: "text", label: "How did you first meet the trafficker?" },
  { id: "met_where", scope: "lead", kind: "text", label: "Where did you first meet them? (City/State)" },
  { id: "met_age", scope: "lead", kind: "int", label: "How old were you when you first met them?" },
  { id: "initial_relationship", scope: "lead", kind: "text", label: "What was your relationship to them at first?" },
  { id: "promises_made", scope: "lead", kind: "multiselect", label: "Did they promise you anything? (select all)",
    options: ["Love/relationship","Money","Job","Housing","Modeling/career","Travel","Drugs","Protection","Other"] },
  { id: "provided_early", scope: "lead", kind: "multiselect", label: "Did they provide anything early on? (select all)",
    options: ["Money","Gifts","Housing","Drugs","Clothing","Phone","Other"] },
  { id: "isolated_early", scope: "lead", kind: "bool", label: "Did they isolate you from friends or family early on?" },
  { id: "asked_to_travel", scope: "lead", kind: "bool", label: "Did they ask you to travel or relocate?" },
  { id: "taken_where", scope: "lead", kind: "text", label: "Where did they take you? (City/State or N/A)" },
  { id: "time_to_commercial", scope: "lead", kind: "text", label: "How soon after meeting did commercial sex begin?" },
  { id: "topic_first_arose", scope: "lead", kind: "text", label: "How did the topic of sex work first come up?" },
  { id: "used_deception", scope: "lead", kind: "bool", label: "Did they use deception or false promises to get you involved?" },
  { id: "deception_detail", scope: "lead", kind: "text", label: "What were you told?" },
  { id: "took_kept_items", scope: "lead", kind: "multiselect", label: "Did they take or keep any of the following? (select all)",
    options: ["ID/documents","Money","Phone","Bank cards","Personal belongings","None"] },
  { id: "intro_other_victims", scope: "lead", kind: "bool", label: "Were you introduced to other victims or girls working for the trafficker?" },

  // ---- MONEY FLOW (once) --------------------------------------------------
  { id: "s_money", scope: "lead", kind: "section", label: "Money Flow" },
  { id: "money_exchanged", scope: "lead", kind: "bool", label: "Was money exchanged for the sex acts?" },
  { id: "money_recipients", scope: "lead", kind: "multiselect", label: "Who received the money? (select all)",
    options: ["Trafficker","You","Both","Other"] },
  { id: "kept_any_money", scope: "lead", kind: "bool", label: "Did you personally keep any of the money?" },
  { id: "harmed_if_short", scope: "lead", kind: "bool", label: "Were you threatened or harmed if you didn't make enough money?" },

  // ---- CLINICAL (once) ----------------------------------------------------
  { id: "s_clinical", scope: "lead", kind: "section", label: "Clinical" },
  { id: "acts_types", scope: "lead", kind: "multiselect", label: "To the extent you're comfortable: did the acts involve vaginal, anal, or oral sex?",
    options: ["Vaginal","Anal","Oral"] },

  // ---- LEGAL HISTORY (once) ----------------------------------------------
  { id: "s_legal", scope: "lead", kind: "section", label: "Legal / Record History" },
  { id: "felony_convicted", scope: "lead", kind: "bool", label: "Have you ever been convicted of a felony?" },
  { id: "felony_count", scope: "lead", kind: "select", label: "How many felony convictions?", options: ["1","2-3","4+","Not sure"] },
  { id: "felony_types", scope: "lead", kind: "multiselect", label: "What type of felony convictions? (select all)",
    options: ["Drug","Theft/property","Violent","Solicitation/prostitution","Fraud","Other"] },
  { id: "felony_years", scope: "lead", kind: "text", label: "Approximately what years? (exact or range)" },
  { id: "felony_during_traffic", scope: "lead", kind: "bool", label: "Were any convictions during the same period as the trafficking?" },
  { id: "open_cases", scope: "lead", kind: "text", label: "Any open felony cases, warrants, probation, or parole?" },
  { id: "open_case_status", scope: "lead", kind: "text", label: "Current status?" },
  { id: "bankruptcy", scope: "lead", kind: "text", label: "Ever filed for bankruptcy? If yes, what type and when?" },
  { id: "aliases", scope: "lead", kind: "text", label: "Ever used another name or alias that may appear on records?" },

  // ---- TRAFFICKER ID (once) ----------------------------------------------
  { id: "s_traffk", scope: "lead", kind: "section", label: "Trafficker Identification" },
  { id: "trafficker_known", scope: "lead", kind: "bool", label: "Do you know the trafficker's name or aliases?" },
  { id: "trafficker_names", scope: "lead", kind: "text", label: "What name or aliases did they use?" },
  { id: "trafficker_desc", scope: "lead", kind: "multiselect", label: "Can you describe the trafficker? (select all)",
    options: ["Male","Female","Tattoos","Distinctive features","Race/ethnicity noted","Approx age","Other"] },

  // ---- APPEARANCE / RED FLAGS (once) -------------------------------------
  { id: "s_redflags", scope: "lead", kind: "section", label: "Appearance / Red Flags" },
  { id: "other_solicit_locations", scope: "lead", kind: "text", label: "Other businesses/locations where the trafficker solicited or abducted girls?" },
  { id: "clothing_types", scope: "lead", kind: "multiselect", label: "What clothing were you typically wearing? (select all)",
    options: ["Lingerie","Revealing","Street clothes","Provided by trafficker","Other"] },
  { id: "underdressed_public", scope: "lead", kind: "bool", label: "Ever outside underdressed during cold or rainy weather?" },
  { id: "visibly_distressed_public", scope: "lead", kind: "bool", label: "Ever visibly injured, bruised, distressed, intoxicated, or disoriented in public hotel areas?" },

  // ---- EVIDENCE (once) ----------------------------------------------------
  { id: "s_evidence", scope: "lead", kind: "section", label: "Evidence Check" },
  { id: "has_social_media", scope: "lead", kind: "bool", label: "Any social media posts, stories, or archived posts from this time?" },
  { id: "evidence_items", scope: "lead", kind: "multiselect", label: "Any evidence related to the hotel or trafficker? (select all)",
    options: ["Photos","Texts/messages","Receipts","Witnesses","Police report","Medical records","Other"] },

  // ========================================================================
  // PROPERTIES — repeatable. Lookup + per-property Hotel Knowledge.
  // ========================================================================
  { id: "s_properties", scope: "lead", kind: "section", label: "Properties (add one per hotel/motel)" },

  { id: "property_lookup", scope: "property", kind: "property_lookup", label: "Identify the property",
    agentNote: "Use cross-streets / landmarks the claimant recalls. Confirm visually with the building photo and Street View. Capture remembered brand AND current brand." },

  { id: "name_as_recalled", scope: "property", kind: "text", label: "Hotel/motel name as the claimant recalls it",
    agentNote: "Must be Motel 6 brand per claimant's memory. If they recall a different brand, capture it and continue — attorney decides." },
  { id: "remembered_brand", scope: "property", kind: "text", label: "Brand the claimant REMEMBERS it as" },
  { id: "stay_month", scope: "property", kind: "monthyear", label: "Approximate month & year of stay" },
  { id: "stay_duration", scope: "property", kind: "text", label: "How long did you stay at that hotel?" },
  { id: "room_floor", scope: "property", kind: "select", label: "Room number or floor?", options: ["Room number","Floor","Both","Neither","Not sure"] },
  { id: "age_at_time", scope: "property", kind: "int", label: "How old were you at the time?" },
  { id: "under_18", scope: "property", kind: "bool", label: "Were you under 18 at any point during this time?" },
  { id: "acts_count_here", scope: "property", kind: "text", label: "Approximately how many forced sex acts occurred at this hotel?" },

  // Hotel Knowledge — CORE
  { id: "hk_core", scope: "property", kind: "section", label: "Hotel Knowledge — core" },
  { id: "who_booked_paid", scope: "property", kind: "text", label: "Who booked/paid for the rooms?" },
  { id: "payment_method", scope: "property", kind: "text", label: "How were rooms paid for? (cash / prepaid card)" },
  { id: "men_per_day", scope: "property", kind: "text", label: "Approximately how many men per day or night?" },
  { id: "asked_staff_for_help", scope: "property", kind: "bool", label: "Did you ever ask hotel staff for help?" },
  { id: "asked_whom", scope: "property", kind: "multiselect", label: "Who did you ask? (select all)", options: ["Front desk","Housekeeping","Manager","Security","Other"] },
  { id: "police_emt_called", scope: "property", kind: "bool", label: "Were police or EMTs ever called to the hotel during this time?" },

  // Hotel Knowledge — DETAIL
  { id: "hk_detail", scope: "property", kind: "section", label: "Hotel Knowledge — detail (primary property)" },
  { id: "repeatedly_same_motel", scope: "property", kind: "bool", label: "Did the trafficker repeatedly book rooms at the same motel?" },
  { id: "specific_rooms_req", scope: "property", kind: "bool", label: "Were specific rooms requested?" },
  { id: "room_change_freq", scope: "property", kind: "text", label: "How frequently did you change rooms?" },
  { id: "visitors_check_desk", scope: "property", kind: "text", label: "Did visitors check in at the front desk or go directly to the room?" },
  { id: "men_waiting_areas", scope: "property", kind: "multiselect", label: "Were men waiting in any of these? (select all)", options: ["Lobby","Hallways","Parking lot","None"] },
  { id: "housekeeping_entered", scope: "property", kind: "bool", label: "Did housekeeping enter the room while you were there?" },
  { id: "towel_change_freq", scope: "property", kind: "text", label: "How often were towels changed?" },
  { id: "sheet_change_freq", scope: "property", kind: "text", label: "How often were sheets changed?" },
  { id: "dnd_long_periods", scope: "property", kind: "bool", label: "Was a Do Not Disturb sign used for long periods?" },
  { id: "condoms_visible", scope: "property", kind: "bool", label: "Were condoms frequently visible in the room or trash?" },
  { id: "staff_interact_traffk", scope: "property", kind: "bool", label: "Did hotel staff ever interact with the trafficker?" },
  { id: "staff_interact_victim", scope: "property", kind: "bool", label: "Did hotel staff ever interact with you directly?" },
  { id: "mgmt_intervened", scope: "property", kind: "bool", label: "Did management/staff ever attempt to intervene or confront anyone?" },
  { id: "violence_public_areas", scope: "property", kind: "bool", label: "Was there violence or confrontation in the lobby, hallways, or parking lot?" },
  { id: "drug_paraphernalia", scope: "property", kind: "bool", label: "Was there drug paraphernalia visible in the room?" },
  { id: "staff_witnessed_drugs", scope: "property", kind: "bool", label: "Did any staff witness intoxication or drug use?" },
  { id: "staff_knowledge_other", scope: "property", kind: "longtext", label: "Anything else that made it obvious the motel knew what was happening?" },
  { id: "landmarks", scope: "property", kind: "longtext", label: "Landmarks the claimant recognized nearby (corroborating detail)" },

  // Variance toggle
  { id: "hk_variance", scope: "property", kind: "section", label: "Variance (only if different at this property)" },
  { id: "has_variance", scope: "property", kind: "bool", label: "Was the trafficker or control method DIFFERENT at this property?" },
  { id: "variance_trafficker", scope: "property", kind: "text", label: "Different trafficker (name/alias)" },
  { id: "variance_control", scope: "property", kind: "multiselect", label: "Different control methods (select all)",
    options: ["Physical force","Threats","Drugs","Debt bondage","Isolation","Other"] },
  { id: "variance_notes", scope: "property", kind: "longtext", label: "Variance notes" },

  // ---- NARRATIVE (once) ---------------------------------------------------
  { id: "s_narrative", scope: "lead", kind: "section", label: "Short Narrative" },
  { id: "narrative", scope: "lead", kind: "longtext", label: "In your own words, keep it general and factual: how did the trafficking occur at that hotel?" },
  { id: "visible_to_staff", scope: "lead", kind: "longtext", label: "What details do you remember that would have been visible to hotel staff?" },
  { id: "anything_missed", scope: "lead", kind: "longtext", label: "Anything we didn't cover that you want the legal team to know?" },

  // ---- SAFETY / DAMAGES (once) -------------------------------------------
  { id: "s_safety", scope: "lead", kind: "section", label: "Safety / Damages" },
  { id: "ongoing_safety", scope: "lead", kind: "bool", label: "Do you have ongoing safety concerns today?" },
  { id: "current_treatment", scope: "lead", kind: "bool", label: "Are you currently receiving medical or mental health treatment related to this?" },

  // ---- EMERGENCY CONTACT (verbatim) --------------------------------------
  { id: "s_ec", scope: "lead", kind: "section", label: "Emergency Contact + Updated Info" },
  {
    id: "script_ec", scope: "lead", kind: "script", label: "Emergency contact script (read verbatim)",
    script:
      "These cases can take time, and we often need to reach you quickly. If we lose contact with you, the firm may not be able to move forward, even if the claim is strong. For that reason we require an emergency contact: someone safe and reliable who would know how to reach you if your number, email, or address changes. We will not discuss the details of your case with them. They are only a way to help us locate you.",
  },
  { id: "ec_name", scope: "lead", kind: "text", label: "Emergency contact full name" },
  { id: "ec_relationship", scope: "lead", kind: "text", label: "Relationship to you" },
  { id: "ec_phone", scope: "lead", kind: "text", label: "Emergency contact phone" },
  { id: "ec_email", scope: "lead", kind: "text", label: "Emergency contact email (if available)" },
  { id: "ec_may_leave_msg", scope: "lead", kind: "bool", label: "Safe to leave them a message asking you to call us back?" },
  { id: "ec_message_script", scope: "lead", kind: "text", label: "If we can't reach you, what should we say?" },

  // ---- COMMS SAFETY -------------------------------------------------------
  { id: "s_comms", scope: "lead", kind: "section", label: "Safe Contact",
    agentNote: "If the claimant's communications are monitored by a spouse/trafficker, select only discreet, safe methods." },
  { id: "comms_monitored", scope: "lead", kind: "bool", label: "Are the claimant's communications monitored by anyone?" },
  { id: "comms_safe_channels", scope: "lead", kind: "multiselect", label: "Safe contact channels (select all)", options: ["Text","Call","Voicemail","Email"] },
  { id: "comms_safe_window", scope: "lead", kind: "text", label: "Safest time and method for follow-up contact" },

  // ---- CLOSING (verbatim) -------------------------------------------------
  { id: "s_closing", scope: "lead", kind: "section", label: "Closing" },
  {
    id: "script_closing", scope: "lead", kind: "script", label: "Closing script (read verbatim)",
    script:
      "Thank you. That completes the verification questions. The next step is internal review. If additional details are needed, someone may follow up. Please do not delete any messages, photos, location history, or records related to this matter. Because of the complexity of this claim, there can be delays while we wait for the courts or defending parties to respond. This is normal and no indication of an outcome. We'd like to check in every 30 to 45 days with updates or just to let you know we're still working toward resolution.",
  },
];

export const STAGES = [
  "referral_received","intake_attempted","intake_in_progress","intake_complete",
  "qa_verified","sent_to_firm","lor_sent","welcome_sent","signed_retained",
  "in_litigation","closed","declined","duplicate",
] as const;

export const STAGE_LABELS: Record<string, string> = {
  referral_received: "Referral Received",
  intake_attempted: "Intake Attempted",
  intake_in_progress: "Intake In Progress",
  intake_complete: "Intake Complete",
  qa_verified: "QA Verified",
  sent_to_firm: "Sent to Firm",
  lor_sent: "LOR Sent",
  welcome_sent: "Welcome Sent",
  signed_retained: "Signed / Retained",
  in_litigation: "In Litigation",
  closed: "Closed",
  declined: "Declined",
  duplicate: "Duplicate",
};

// Stages the FIRM (TMP) is allowed to set from the portal.
export const FIRM_WRITABLE_STAGES = [
  "lor_sent","welcome_sent","signed_retained","in_litigation","closed",
];
