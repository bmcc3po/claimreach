// ============================================================================
// Verbatim scripting. Anything in SPOKEN is read to the caller as written.
// Anything in a `note` is agent-only. Compliance rules are rendered in the UI,
// not just documented here.
// ============================================================================

export const CALLER_DETAIL_SCRIPTS = {
  nameAsk: "I can absolutely help you with that. Who do I have the pleasure of speaking with?",
  firstNamePermission: "Thanks [name]. Mind if I go by your first name while we work through this?",
};

// Used when the caller has not treated. This is a tell, not a question.
export const NOT_TREATED_TELL =
  "Here is the most important thing I am going to tell you today. An injury that is not documented by a doctor does not exist as far as the insurance company is concerned. So you need to get seen. Tell me you are going to get that done.";

export const WRONGFUL_DEATH_SCRIPT =
  "I am so sorry for your loss. I want to make sure this is handled right for your family. Are you the spouse, the parent, the child, or the executor of the estate?";

// ---------------------------------------------------------------- SIGN
export const SIGN_SCRIPTS = {
  nextStep: "I have everything I need. I am getting you set up right now.",
  nextStepNote: "Send the retainer and stay on the line through the signature. Do not hang up before it is signed.",
  // Each rung waits for a yes before the next is read.
  ladder: [
    "One important thing, [name]. If that insurance company reaches out to you, do not get on the phone with them. Send them straight to us. Clear?",
    "Want to know why I am so firm about that?",
    "Insurance companies keep their own numbers on this, and what those numbers show is that a represented claim costs them meaningfully more to close. Read that the other way and you can see why they would rather you go it alone.",
    "So from today forward, every call from them comes to us. You good with that?",
  ],
  ladderNote:
    "Each line waits for a yes before you read the next one. The statistic stays attributed to the insurance industry's own data and is NEVER applied to this caller's case.",
  reassurance:
    "Here is the deal from here. You put your energy into healing and into your family. The case, the paperwork, the legal side, that is ours to carry. Fair?",
  beforeHangup: "Have I covered everything for you today?",
  passengerAsk:
    "You mentioned [passenger] was in the car with you. Are they working with an attorney? If not, do you have a good number for them so we can make sure they are taken care of too?",
};

export const POST_SIGN_FIELDS: { key: string; label: string; sensitive?: boolean; ref?: "vehicle" | "auto_carrier" | "health_carrier"; half?: boolean }[] = [
  { key: "vehicle_year",    label: "Vehicle year", half: true },
  { key: "vehicle",         label: "Vehicle make / model", ref: "vehicle" },
  { key: "auto_carrier",    label: "Their auto carrier", ref: "auto_carrier" },
  { key: "health_ins",      label: "Health insurance", ref: "health_carrier" },
  { key: "other_carrier",   label: "Other driver's carrier", ref: "auto_carrier" },
  { key: "media",           label: "Photos / video available?" },
  { key: "dl_number",       label: "Driver's license number", sensitive: true },
  { key: "dob",             label: "Date of birth", sensitive: true },
  { key: "ssn",             label: "SSN", sensitive: true },
  { key: "passenger",       label: "Passenger name + number (if any)" },
];

// ---------------------------------------------------------------- REFER
export const REFER_SCRIPTS = {
  main:
    "Okay [name], here is what happens next. We work with a nationwide network of attorneys, and different firms take different kinds of cases. I am sending everything you gave me to the firms in our network for review. You will hear back within [X] on whether your case has been accepted. You do not need to do anything in the meantime.",
  ifAsked:
    "I am not able to promise that. What I can tell you is that the firms in our network will see everything you gave me, and you will get an answer.",
  ifAskedNote: "Read this if they ask whether they will be accepted. Never predict an outcome.",
  closing:
    "One more thing while you are waiting. Keep going to the doctor if you are hurting. Do not give the other insurance company a recorded statement. And do not post anything about the accident on social media. That is true no matter which firm ends up handling this. Take care of yourself.",
};

// ---------------------------------------------------------------- DISQUALIFY
// One close per reason. The console picks it from the outcome's closeKey.
export const DQ_CLOSES: Record<string, { close: string; note?: string }> = {
  attorney: {
    close: "Understood, and I respect that. We do not take clients from other firms. Best of luck with your case. Take care.",
  },
  settled: {
    close: "Thank you for telling me. Once a release is signed the claim is generally closed, so this is not something we can take on. I appreciate you calling in.",
  },
  caused: {
    close: "I appreciate you being straight with me. Based on what you have described, this is not something our attorneys can take on. I hope you are healing up okay.",
  },
  no_injury: {
    close: "I am glad you walked away from it, that is the best outcome there is. Without an injury there is no claim to open. But if something comes up in the next few days and you end up seeing a doctor, please call me back directly. Neck and back pain from an accident can show up late. Take care.",
    note: "Log this one as a live callback. Late-onset pain turns some of these into real files.",
  },
  wont_treat: {
    close: "I understand, and it is your call. Without a doctor documenting the injury, there is nothing for anyone to work with. If you change your mind and get looked at, call me back and we will pick this right back up. Take care.",
  },
  presence: {
    close: "I appreciate you explaining it. Based on what you have described, this is not something our attorneys can take on. I hope you are doing okay.",
  },
  not_legal: {
    close: "I appreciate you calling in. This is not something our attorneys handle, so I do not want to hold you up. Take care.",
  },
};

// ---------------------------------------------------------------- ESCALATION
export const SECONDARY_REVIEW_SCRIPTS = {
  wrongful_death: {
    banner: "Wrongful death. Do not close this out.",
    note: "Set this aside for the firm. Stay warm on the call, take the details, and hand it up.",
  },
  elevated: {
    banner: "Elevated for review. Do not close this out.",
    note: "This did not meet the base criteria but carries a flag that outranks it. Do not read the disqualifier to the caller.",
  },
  default: {
    banner: "Secondary review. Do not close this out.",
    note: "Flag and escalate. For hospitalized 3+ days and catastrophic injury, escalate while you are still on the call.",
  },
};

export const CALLBACK_SCRIPT =
  "I want to make sure I am talking to the right person for this. Is there a good time to reach them, or someone with authority for them?";

// ---------------------------------------------------------------- COMPLIANCE
// Rendered on screen. TMT runs the network model, so this stays tight.
export const COMPLIANCE_RULES = [
  "Never promise or predict an outcome, or say the caller has a case or will be accepted",
  "Never quote, estimate, hint at, or compare any settlement value",
  "Never tell a caller what their injuries are, or who was at fault — the caller states those",
  "Never read a dollar threshold aloud",
  "Never coach a caller on what to say to an adjuster",
  "Never imply an attorney-client relationship on a lead that is not signed",
  "Representation is contingency only. Never ask for payment or banking information",
];
