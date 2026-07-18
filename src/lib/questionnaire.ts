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
  | "int" | "monthyear" | "script" | "section" | "gate" | "property_lookup"
  | "date" | "phone" | "email" | "facility_lookup";

export interface Condition {
  fieldId: string;                 // an earlier field's id
  op: "is" | "is_not" | "any_of" | "is_blank" | "not_blank";
  value?: string;                  // for is/is_not
  values?: string[];              // for any_of
}
export interface ShowIf {
  match: "all" | "any";            // AND vs OR
  rules: Condition[];
}

export interface Field {
  id: string;            // db column (or synthetic for script/section/gate)
  scope: "lead" | "property";
  kind: FieldKind;
  label: string;
  options?: string[];
  // Fields sharing a group render on ONE screen in the guided runner. Use it for
  // capture blocks (address, insurance, vehicle). Never for criteria questions:
  // those are asked one at a time, in order, verbatim.
  group?: string;
  // Stored-value -> spoken-label map for choice fields, so exports print the
  // words the caller heard rather than the code we stored.
  choices?: { value: string; label: string }[];
  script?: string;       // verbatim read-aloud text
  agentNote?: string;    // agent-only guidance, never read aloud
  placeholder?: string;  // input hint text
  vital?: boolean;       // highlighted as vital in the original
  gateType?: "dq" | "supervisor" | "safety" | "end_intake";
  surface?: "intake" | "contact" | "both";  // where this field appears; default intake
  locField?: string;     // for facility_lookup: id of the paired city/state field to auto-fill
  showIf?: ShowIf;        // conditional visibility (AND/OR of rules on earlier answers)
}

export const INTAKE: Field[] = [
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
  { id: "s_threshold", scope: "lead", kind: "section", label: "Threshold" },
  {
      id: "g_victim", scope: "lead", kind: "bool", vital: true,
      label: "Were you or a loved one a victim of sex trafficking or forced prostitution at any hotel or motel?",
    },
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
  { id: "s_ip", scope: "lead", kind: "section", label: "Injured Party" },
  { id: "ip_first", surface: "contact", scope: "lead", kind: "text", label: "First name (Injured Party)", vital: true },
  { id: "ip_last", surface: "contact", scope: "lead", kind: "text", label: "Last name (Injured Party)", vital: true },
  { id: "ip_dob", surface: "contact", scope: "lead", kind: "date", label: "Date of birth (Injured Party)", vital: true },
  { id: "ip_ssn", surface: "contact", scope: "lead", kind: "text", label: "SSN (Injured Party)" },
  { id: "ip_phone", surface: "contact", scope: "lead", kind: "phone", label: "Phone number of injured" },
  { id: "ip_email", surface: "contact", scope: "lead", kind: "email", label: "Email of injured" },
  { id: "ip_deceased", surface: "contact", scope: "lead", kind: "bool", label: "Is the Injured Party deceased?", vital: true },
  { id: "ip_dod", surface: "contact", scope: "lead", kind: "date", label: "If yes, date of death" },
  { id: "s_caller", scope: "lead", kind: "section", label: "Caller & Contact" },
  { id: "caller_type", surface: "contact", scope: "lead", kind: "select", label: "Is the caller:", vital: true, options: ["Self / Injured Party", "OBO"] },
  { id: "caller_first", surface: "contact", scope: "lead", kind: "text", label: "First name (Caller)", vital: true },
  { id: "caller_last", surface: "contact", scope: "lead", kind: "text", label: "Last name (Caller)", vital: true },
  { id: "caller_phone", surface: "contact", scope: "lead", kind: "phone", label: "Phone number (Caller)", vital: true },
  { id: "caller_email", surface: "contact", scope: "lead", kind: "email", label: "Email (Caller)", vital: true },
  { id: "caller_dob", surface: "contact", scope: "lead", kind: "date", label: "DOB (Caller)", vital: true },
  { id: "caller_ssn", surface: "contact", scope: "lead", kind: "text", label: "SSN (Caller)" },
  { id: "is_legal_rep", surface: "contact", scope: "lead", kind: "bool", label: "Are you the Injured Party's legal representative?",
      agentNote: "If NO, stop and instruct the legal rep to call us directly." },
  { id: "caller_relation_ip", surface: "contact", scope: "lead", kind: "text", label: "If caller is NOT the injured, how related to injured?" },
  { id: "best_time", surface: "contact", scope: "lead", kind: "text", label: "Best time to contact" },
  { id: "s_mail", scope: "lead", kind: "section", label: "Mailing Address" },
  { id: "mail_addr1", surface: "contact", scope: "lead", kind: "text", label: "Mailing address 1", vital: true },
  { id: "mail_addr2", surface: "contact", scope: "lead", kind: "text", label: "Apt, Bldg, Unit #" },
  { id: "mail_city", surface: "contact", scope: "lead", kind: "text", label: "City", vital: true },
  { id: "mail_state", surface: "contact", scope: "lead", kind: "select", label: "State", vital: true, options: ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","DC","WV","WI","WY","PR"] },
  { id: "mail_zip", surface: "contact", scope: "lead", kind: "text", label: "Zip", vital: true },
  { id: "s_ec", scope: "lead", kind: "section", label: "Emergency Contact" },
  { id: "script_ec", surface: "contact", scope: "lead", kind: "script", label: "Emergency contact (read verbatim)",
      script: "Our attorney does require that we identify an emergency contact in the event that we cannot reach you regarding an urgent update. We will not share any details of the claim with them." },
  { id: "ec_first", surface: "contact", scope: "lead", kind: "text", label: "First name (EC)", vital: true },
  { id: "ec_last", surface: "contact", scope: "lead", kind: "text", label: "Last name (EC)", vital: true },
  { id: "ec_phone", surface: "contact", scope: "lead", kind: "phone", label: "Phone (EC)", vital: true },
  { id: "ec_address", surface: "contact", scope: "lead", kind: "text", label: "Address (EC)" },
  { id: "ec_relationship", surface: "contact", scope: "lead", kind: "select", label: "Their relationship to you",
      options: ["PNC's Mother","PNC's Father","PNC's Son","PNC's Daughter","PNC's Spouse","PNC's Brother","PNC's Sister","PNC's Friend","PNC's Caregiver","Other"] },
  { id: "ec_permission", surface: "contact", scope: "lead", kind: "bool", label: "Permission to discuss case details with EC?", vital: true },
  { id: "ec_email", scope: "lead", kind: "text", label: "Emergency contact email (if available)" },
  { id: "ec_may_leave_msg", scope: "lead", kind: "bool", label: "Safe to leave them a message asking you to call us back?" },
  { id: "ec_message_script", scope: "lead", kind: "text", label: "If we can't reach you, what should we say?" },
  { id: "s_properties", scope: "lead", kind: "section", label: "Properties (add one per hotel/motel)" },
  { id: "property_lookup", scope: "property", kind: "property_lookup", label: "Identify the property",
      agentNote: "Use cross-streets / landmarks the claimant recalls. Confirm visually with the building photo and Street View. Capture remembered brand AND current brand." },
  { id: "name_as_recalled", scope: "property", kind: "text", label: "Hotel/motel name as the claimant recalls it",
      agentNote: "Must be Motel 6 brand per claimant's memory. If they recall a different brand, capture it and continue — attorney decides." },
  { id: "remembered_brand", scope: "property", kind: "text", label: "Brand the claimant REMEMBERS it as" },
  { id: "stay_month", scope: "property", kind: "monthyear", label: "Approximate month & year of stay" },
  { id: "stay_duration", scope: "property", kind: "text", label: "How long did you stay at that hotel?" },
  { id: "room_floor", scope: "property", kind: "text", label: "Room number, floor, and location within the hotel", placeholder: "e.g. Room 214, 2nd floor, back corner near the laundry / by the alley" },
  { id: "age_at_time", scope: "property", kind: "int", label: "How old were you at the time?" },
  { id: "under_18", scope: "property", kind: "bool", label: "Were you under 18 at any point during this time?" },
  { id: "acts_count_here", scope: "property", kind: "text", label: "Approximately how many forced sex acts occurred at this hotel?" },
  { id: "hk_core", scope: "lead", kind: "section", label: "Hotel Knowledge — core" },
  { id: "who_booked_paid", scope: "property", kind: "text", label: "Who booked/paid for the rooms?" },
  { id: "payment_method", scope: "property", kind: "text", label: "How were rooms paid for? (cash / prepaid card)" },
  { id: "men_per_day", scope: "property", kind: "text", label: "Approximately how many men per day or night?" },
  { id: "asked_staff_for_help", scope: "property", kind: "bool", label: "Did you ever ask hotel staff for help?" },
  { id: "asked_whom", scope: "property", kind: "multiselect", label: "Who did you ask? (select all)", options: ["Front desk","Housekeeping","Manager","Security","Other"] },
  { id: "police_emt_called", scope: "property", kind: "bool", label: "Were police or EMTs ever called to the hotel during this time?" },
  { id: "hk_ops", scope: "lead", kind: "section", label: "Hotel Operations" },
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
  { id: "hk_staff", scope: "lead", kind: "section", label: "Staff Awareness" },
  { id: "staff_interact_traffk", scope: "property", kind: "bool", label: "Did hotel staff ever interact with the trafficker?" },
  { id: "staff_interact_victim", scope: "property", kind: "bool", label: "Did hotel staff ever interact with you directly?" },
  { id: "mgmt_intervened", scope: "property", kind: "bool", label: "Did management/staff ever attempt to intervene or confront anyone?" },
  { id: "violence_public_areas", scope: "property", kind: "bool", label: "Was there violence or confrontation in the lobby, hallways, or parking lot?" },
  { id: "drug_paraphernalia", scope: "property", kind: "bool", label: "Was there drug paraphernalia visible in the room?" },
  { id: "staff_witnessed_drugs", scope: "property", kind: "bool", label: "Did any staff witness intoxication or drug use?" },
  { id: "staff_knowledge_other", scope: "property", kind: "longtext", label: "Anything else that made it obvious the motel knew what was happening?" },
  { id: "landmarks", scope: "property", kind: "longtext", label: "Landmarks the claimant recognized nearby (corroborating detail)" },
  { id: "hk_variance", scope: "lead", kind: "section", label: "Variance (only if different at this property)" },
  { id: "has_variance", scope: "property", kind: "bool", label: "Was the trafficker or control method DIFFERENT at this property?" },
  { id: "variance_trafficker", scope: "property", kind: "text", label: "Different trafficker (name/alias)" },
  { id: "variance_control", scope: "property", kind: "multiselect", label: "Different control methods (select all)",
      options: ["Physical force","Threats","Drugs","Debt bondage","Isolation","Other"] },
  { id: "variance_notes", scope: "property", kind: "longtext", label: "Variance notes" },
  { id: "s_control", scope: "lead", kind: "section", label: "Control / Coercion", agentNote: "DO NOT LET THEM RAMBLE. Keep to the questions." },
  { id: "was_controlled", scope: "lead", kind: "bool", label: "Was someone else controlling or forcing you to engage in sex acts?" },
  { id: "control_methods", scope: "lead", kind: "multiselect", label: "How were you controlled? (select all)",
      agentNote: "DO NOT READ THE LIST. Mark what they describe.",
      options: ["Physical force","Threats","Drugs","Debt bondage","Isolation","Controlled money","Controlled ID/documents","Controlled phone","Emotional/psychological","Other"] },
  { id: "could_refuse", scope: "lead", kind: "bool", label: "Were you able to refuse without consequences?" },
  { id: "had_phone_money_id", scope: "lead", kind: "bool", label: "Did you have access to your own phone, money, and ID during this time?" },
  { id: "s_recruit", scope: "lead", kind: "section", label: "How You Met" },
  { id: "met_how", scope: "lead", kind: "text", label: "How did you first meet the trafficker?" },
  { id: "met_where", scope: "lead", kind: "text", label: "Where did you first meet them? (City/State)" },
  { id: "met_age", scope: "lead", kind: "int", label: "How old were you when you first met them?" },
  { id: "initial_relationship", scope: "lead", kind: "text", label: "What was your relationship to them at first?" },
  { id: "promises_made", scope: "lead", kind: "multiselect", label: "Did they promise you anything? (select all)",
      options: ["Love/relationship","Money","Job","Housing","Modeling/career","Travel","Drugs","Protection","Other"] },
  { id: "provided_early", scope: "lead", kind: "multiselect", label: "Did they provide anything early on? (select all)",
      options: ["Money","Gifts","Housing","Drugs","Clothing","Phone","Other"] },
  { id: "topic_first_arose", scope: "lead", kind: "text", label: "How did the topic of sex work first come up?" },
  { id: "used_deception", scope: "lead", kind: "bool", label: "Did they use deception or false promises to get you involved?" },
  { id: "deception_detail", scope: "lead", kind: "text", label: "What were you told?" },
  { id: "s_recruit2", scope: "lead", kind: "section", label: "Early Control & Movement" },
  { id: "isolated_early", scope: "lead", kind: "bool", label: "Did they isolate you from friends or family early on?" },
  { id: "asked_to_travel", scope: "lead", kind: "bool", label: "Did they ask you to travel or relocate?" },
  { id: "taken_where", scope: "lead", kind: "text", label: "Where did they take you? (City/State or N/A)" },
  { id: "time_to_commercial", scope: "lead", kind: "text", label: "How soon after meeting did commercial sex begin?" },
  { id: "took_kept_items", scope: "lead", kind: "multiselect", label: "Did they take or keep any of the following? (select all)",
      options: ["ID/documents","Money","Phone","Bank cards","Personal belongings","None"] },
  { id: "intro_other_victims", scope: "lead", kind: "bool", label: "Were you introduced to other victims or girls working for the trafficker?" },
  { id: "s_money", scope: "lead", kind: "section", label: "Acts & Money" },
  { id: "acts_types", scope: "lead", kind: "multiselect", label: "To the extent you're comfortable: did the acts involve vaginal, anal, or oral sex?",
      options: ["Vaginal","Anal","Oral"] },
  { id: "money_exchanged", scope: "lead", kind: "bool", label: "Was money exchanged for the sex acts?" },
  { id: "money_recipients", scope: "lead", kind: "multiselect", label: "Who received the money? (select all)",
      options: ["Trafficker","You","Both","Other"] },
  { id: "kept_any_money", scope: "lead", kind: "bool", label: "Did you personally keep any of the money?" },
  { id: "harmed_if_short", scope: "lead", kind: "bool", label: "Were you threatened or harmed if you didn't make enough money?" },
  { id: "s_traffk", scope: "lead", kind: "section", label: "Trafficker Identification" },
  { id: "trafficker_known", scope: "lead", kind: "bool", label: "Do you know the trafficker's name or aliases?" },
  { id: "trafficker_names", scope: "lead", kind: "text", label: "What name or aliases did they use?" },
  { id: "trafficker_desc", scope: "lead", kind: "multiselect", label: "Can you describe the trafficker? (select all)",
      options: ["Male","Female","Tattoos","Distinctive features","Race/ethnicity noted","Approx age","Other"] },
  { id: "other_solicit_locations", scope: "lead", kind: "text", label: "Other businesses/locations where the trafficker solicited or abducted girls?" },
  { id: "s_evidence", scope: "lead", kind: "section", label: "Evidence & Red Flags" },
  { id: "clothing_types", scope: "lead", kind: "multiselect", label: "What clothing were you typically wearing? (select all)",
      options: ["Lingerie","Revealing","Street clothes","Provided by trafficker","Other"] },
  { id: "underdressed_public", scope: "lead", kind: "bool", label: "Ever outside underdressed during cold or rainy weather?" },
  { id: "visibly_distressed_public", scope: "lead", kind: "bool", label: "Ever visibly injured, bruised, distressed, intoxicated, or disoriented in public hotel areas?" },
  { id: "has_social_media", scope: "lead", kind: "bool", label: "Any social media posts, stories, or archived posts from this time?" },
  { id: "evidence_items", scope: "lead", kind: "multiselect", label: "Any evidence related to the hotel or trafficker? (select all)",
      options: ["Photos","Texts/messages","Receipts","Witnesses","Police report","Medical records","Other"] },
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
  { id: "s_narrative", scope: "lead", kind: "section", label: "Narrative & Safety" },
  { id: "narrative", scope: "lead", kind: "longtext", label: "In your own words, keep it general and factual: how did the trafficking occur at that hotel?" },
  { id: "visible_to_staff", scope: "lead", kind: "longtext", label: "What details do you remember that would have been visible to hotel staff?" },
  { id: "anything_missed", scope: "lead", kind: "longtext", label: "Anything we didn't cover that you want the legal team to know?" },
  { id: "ongoing_safety", scope: "lead", kind: "bool", label: "Do you have ongoing safety concerns today?" },
  { id: "current_treatment", scope: "lead", kind: "bool", label: "Are you currently receiving medical or mental health treatment related to this?" },
  { id: "s_comms", scope: "lead", kind: "section", label: "Safe Contact" },
  { id: "comms_monitored", scope: "lead", kind: "bool", label: "Are the claimant's communications monitored by anyone?" },
  { id: "comms_safe_channels", scope: "lead", kind: "multiselect", label: "Safe contact channels (select all)", options: ["Text","Call","Voicemail","Email"] },
  { id: "comms_safe_window", scope: "lead", kind: "text", label: "Safest time and method for follow-up contact" },
  { id: "s_closing", scope: "lead", kind: "section", label: "Closing" },
  {
      id: "script_closing", scope: "lead", kind: "script", label: "Closing script (read verbatim)",
      script:
        "Thank you. That completes the verification questions. The next step is internal review. If additional details are needed, someone may follow up. Please do not delete any messages, photos, location history, or records related to this matter. Because of the complexity of this claim, there can be delays while we wait for the courts or defending parties to respond. This is normal and no indication of an outcome. We'd like to check in every 30 to 45 days with updates or just to let you know we're still working toward resolution.",
    },
];

// The canonical SPINE for any case type that lacks a bespoke built-in form:
// the universal contact surface (caller, address, emergency contact) plus the
// three mandatory gates (represented / injured party / authority). It carries NO
// trafficking-specific questions, so a non-trafficking file never sees motel
// questions. Bespoke per-type forms (medmal, etc.) override this entirely.
export const SPINE: Field[] = [
  { id: "s_open", scope: "lead", kind: "section", label: "Opening" },
  // Generic opener. This spine is what EVERY non-motel case type falls back to,
  // so it must not carry trafficking-specific language. The "are you in a safe
  // place to speak" safety gate belongs to the trafficking intake only; asking it
  // on a car accident is nonsense and made every file read as a Motel 6 form.
  { id: "script_intro_generic", scope: "lead", kind: "script", label: "Intro (read verbatim)",
    script: "Thank you. My name is ___. I'm calling from the law firm handling your claim. Is now a good time to go through this with you?",
    agentNote: "If now is not a good time, schedule a callback and stop here." },
  { id: "ok_to_proceed", scope: "lead", kind: "bool", label: "Is now a good time to proceed?",
    agentNote: "If no, schedule the callback. Do not run the intake." },
  // Universal contact surface (reused from INTAKE's contact-surface fields).
  ...INTAKE.filter((f) => f.surface === "contact"),
  // The three mandatory gates, generic phrasing.
  { id: "s_gates", scope: "lead", kind: "section", label: "Mandatory gates" },
  { id: "g_represented", scope: "lead", kind: "gate", gateType: "dq", vital: true,
    label: "Is the claimant already represented by another attorney for this matter?",
    agentNote: "If YES, this is a DQ. Do not proceed." },
  { id: "g_injured_party", scope: "lead", kind: "bool", vital: true,
    label: "Are we speaking with the injured party (or their authorized legal representative)?" },
  { id: "g_authority", scope: "lead", kind: "bool", vital: true,
    label: "Does the caller have authority to sign on the injured party's behalf (if not the injured party)?" },
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

// Group the lead-scope questionnaire into stepped segments by section marker.
// Each segment = a section header + the fields under it until the next section.
// Properties is its own segment (special-rendered). A final "Schedule" segment
// is appended by the intake component.
export interface Segment { id: string; title: string; fields: Field[]; }

export function getSegments(): Segment[] {
  // Intake wizard shows lead-scope fields EXCEPT those surfaced to the contact tab.
  const leadFields = INTAKE.filter((f) => f.scope === "lead" && f.surface !== "contact");
  const segs: Segment[] = [];
  let cur: Segment | null = null;
  for (const f of leadFields) {
    if (f.kind === "section") {
      cur = { id: f.id, title: f.label, fields: [] };
      segs.push(cur);
    } else if (cur) {
      cur.fields.push(f);
    } else {
      cur = { id: "s_start", title: "Start", fields: [f] };
      segs.push(cur);
    }
  }
  // Drop any now-empty sections (e.g. a section whose fields were all contact).
  return segs.filter((s) => s.fields.length > 0);
}

// Fields that live on the Contact Info tab (caller info + emergency contact).
export function getContactFields(): Field[] {
  return INTAKE.filter((f) => f.surface === "contact");
}

// Map field id -> human label (for audit descriptions like "entered Q1 ...").
export function fieldLabelMap(): Record<string, string> {
  const m: Record<string, string> = {};
  for (const f of INTAKE) {
    if (f.kind === "section" || f.kind === "script" || f.kind === "gate") continue;
    m[f.id] = (f as any).label ?? f.id;
  }
  return m;
}

// ---- Multi-claim-type registry -------------------------------------------
import { MEDMAL_INTAKE } from "./medmal";

// Generic segment builder for any field set (excludes contact-surface fields).
export function segmentsFrom(fields: Field[]): Segment[] {
  const lead = fields.filter((f) => f.scope === "lead" && f.surface !== "contact");
  const segs: Segment[] = [];
  let cur: Segment | null = null;
  for (const f of lead) {
    if (f.kind === "section") { cur = { id: f.id, title: f.label, fields: [] }; segs.push(cur); }
    else if (cur) cur.fields.push(f);
    else { cur = { id: "s_start", title: "Start", fields: [f] }; segs.push(cur); }
  }
  // s_properties renders the property-lookup tool (PropertyCard), not inline
  // fields, so it must survive even with zero lead-scope fields of its own.
  return segs.filter((s) => s.fields.length > 0 || s.id === "s_properties");
}

export function contactFieldsFrom(fields: Field[]): Field[] {
  return fields.filter((f) => f.surface === "contact");
}

// Resolve the field set for a claim type.
export function intakeForType(claimType: string): Field[] {
  const t = (claimType || "").toLowerCase();
  if (t.includes("medmal") || t.includes("malpractice")) return MEDMAL_INTAKE;
  if (t.includes("motel") || t.includes("trafficking")) return INTAKE;
  // Known case types that don't yet have a bespoke built-in fall back to the
  // canonical spine (the 3 mandatory gates + contact), NOT the motel questionnaire.
  // This guarantees we never show trafficking questions on a non-trafficking file.
  return SPINE;
}

export function segmentsForType(claimType: string): Segment[] {
  return segmentsFrom(intakeForType(claimType));
}
export function contactFieldsForType(claimType: string): Field[] {
  return contactFieldsFrom(intakeForType(claimType));
}

// Evaluate a field's showIf against the current answers. No condition = always show.
export function fieldVisible(field: Field, answers: Record<string, any>): boolean {
  const si = field.showIf;
  if (!si || !si.rules || si.rules.length === 0) return true;
  const test = (c: Condition): boolean => {
    const v = answers[c.fieldId];
    const sv = v == null ? "" : Array.isArray(v) ? v.join("|") : String(v);
    switch (c.op) {
      case "is": return sv === (c.value ?? "");
      case "is_not": return sv !== (c.value ?? "");
      case "any_of": {
        const set = c.values ?? [];
        if (Array.isArray(v)) return v.some((x) => set.includes(String(x)));
        return set.includes(sv);
      }
      case "is_blank": return sv === "";
      case "not_blank": return sv !== "";
      default: return true;
    }
  };
  return si.match === "any" ? si.rules.some(test) : si.rules.every(test);
}
