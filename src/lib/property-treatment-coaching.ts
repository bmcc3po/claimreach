// Shared by Agent Guides and both call sidebars. No client answers or state.
export const PROPERTY_TREATMENT_SOURCE = "https://drive.google.com/file/d/1weUwqA55ulyy3XX7repB-9cBfCDTq28B/view";
export type CoachingTopic = {
  id: string;
  category: "Car & insurance" | "Treatment";
  question: string;
  say: string;
  note: string;
  keywords: string;
};

export const PROPERTY_TREATMENT_TOPICS: CoachingTopic[] = [
  {
    id: "car-help", category: "Car & insurance", question: "Who helps with my car?",
    say: "I know getting your car back matters too. The car claim and the injury claim are separate. I can help you understand the insurance steps and ask the firm about anything that needs their attention.",
    note: "Property damage can include repairs, a total loss, towing, storage and damaged belongings. Check the client's agreement before describing what the firm handles; refer disputed coverage or legal questions to the firm.",
    keywords: "property damage repairs vehicle scope representation belongings towing storage",
  },
  {
    id: "own-coverage", category: "Car & insurance", question: "Should I use my own insurance?",
    say: "If you have collision coverage, your insurer may be able to get the car claim moving while the other company reviews it. Let's check what coverage and deductible you have first.",
    note: "“Full coverage” is not a specific benefit. Collision may cover the car, less the deductible. The insurer may seek recovery from the other party (subrogation); neither recovery nor a deductible refund is guaranteed.",
    keywords: "full coverage collision deductible subrogation refund own insurer",
  },
  {
    id: "liability-only", category: "Car & insurance", question: "I only have liability insurance.",
    say: "Thanks for letting me know. Liability coverage generally pays for damage you cause to someone else, not repairs to your own car. Let's note the other driver's insurer and what they've told you so far.",
    note: "The other insurer will investigate coverage and responsibility. Ask whether any other applicable coverage is available; do not promise acceptance or a payment date.",
    keywords: "liability only other driver acceptance at fault responsibility waiting",
  },
  {
    id: "rental", category: "Car & insurance", question: "Who pays for a rental?",
    say: "Being without a car is a lot to deal with. Your policy may have rental coverage, or the other insurer may approve one. Before you book, ask what they'll cover, for how long, and at what daily rate. Keep the receipts.",
    note: "Rental reimbursement is a separate benefit with limits. “Full coverage” does not guarantee it. Confirm approval and costs with the insurer; receipts do not guarantee reimbursement. Rental coverage may end after a total-loss offer.",
    keywords: "rental car reimbursement receipts daily rate transportation full coverage",
  },
  {
    id: "total-loss", category: "Car & insurance", question: "My car is totaled and I still owe money.",
    say: "I'm sorry—that's another worry you didn't need. The insurer will explain the car's value and its offer. If the loan is higher than that amount, let's check whether you have GAP coverage and get the firm any questions about the offer.",
    note: "A total-loss payment is generally based on the vehicle's value before the crash, subject to coverage and applicable rules. It may not pay off the loan. GAP coverage has its own terms; do not promise a payoff or recommend accepting an offer.",
    keywords: "totaled total loss actual cash value ACV loan gap payoff settlement",
  },
  {
    id: "advance", category: "Car & insurance", question: "Can the firm pay for my rental?",
    say: "I hear how urgent this is. I can't promise the firm will cover a rental, but I can flag the need and help you check the insurance options. Let's find out what's available before you take on that cost.",
    note: "Follow the firm's policy and ask a supervisor about financial assistance. Rules depend on jurisdiction and circumstances; do not say all assistance is always illegal, promise funding, or recommend a lender.",
    keywords: "advance money financial assistance firm pay rental funding loan lender",
  },
  {
    id: "frustrated", category: "Car & insurance", question: "Why is this taking so long?",
    say: "I'd be frustrated too. Let's write down exactly where things are stuck and who you've spoken with, so the team can help with the next step. You don't have to repeat the whole story.",
    note: "Capture the insurer, claim number, adjuster and specific problem. Escalate a disputed offer or coverage decision; do not guess about timing or blame.",
    keywords: "upset angry frustrated delay taking forever waiting claim adjuster",
  },
  {
    id: "not-seen", category: "Treatment", question: "I haven't been checked yet / it's only soreness.",
    say: "I'm glad you're talking with us. Your health comes first, and you don't have to figure out an injury on your own. Please get medical advice promptly about how you're feeling. Is anything making that difficult today?",
    note: "Symptoms can appear later. Do not diagnose, minimize symptoms or promise one visit is enough. Record symptoms in the client's words and help the team understand barriers to care.",
    keywords: "doctor treatment soreness pain feel fine delayed symptoms not hurt adrenaline",
  },
  {
    id: "where-care", category: "Treatment", question: "When and where should I get treatment?",
    say: "Let's focus on getting you the right care. A medical professional can advise you on where to go and how soon. If this feels like an emergency, call 911 now—we can finish this call later.",
    note: "Do not tell someone to wait up to 24 hours with urgent symptoms. An ER is for emergency care, not for a stronger claim record. For other concerns, encourage prompt clinical advice about the appropriate setting and follow the provider's instructions.",
    keywords: "ER emergency room urgent care hospital orthopedic today 24 hours when where",
  },
  {
    id: "care-barriers", category: "Treatment", question: "I have no insurance / can't get there.",
    say: "Thank you for telling me. Let's note what's getting in the way—cost, a ride, or your schedule—and ask the team what help may be available. Would somewhere near home or work be easier?",
    note: "Record health insurance, convenient location and appointment times. Do not promise free care, a specific provider, virtual care or payment at settlement. Emergency symptoms take priority over insurance questions.",
    keywords: "health insurance uninsured money cost transport ride virtual home work schedule network",
  },
  {
    id: "follow-care", category: "Treatment", question: "I missed treatment / stopped going.",
    say: "Things happen. What got in the way, and what did your provider recommend? Let's make a note so the team can help. Please check with your provider about the next step and tell them if your symptoms have changed.",
    note: "Record dates and the real reason for a gap. Encourage medically recommended follow-up; do not pressure unnecessary care or claim a gap automatically defeats the case. The firm reviews case implications.",
    keywords: "appointments gap stopped missed follow up ongoing treatment records",
  },
  {
    id: "emergency", category: "Treatment", question: "The caller may need emergency help.",
    say: "Your safety comes first. Please call 911 now. We can take care of the paperwork later.",
    note: "Pause intake for reported trouble breathing, chest pain, confusion, loss of consciousness, new weakness, severe sudden pain or a possible serious head or spine injury. Do not diagnose or continue paperwork while urgent help is needed.",
    keywords: "911 emergency red flags chest breathing head spine confusion faint numbness weakness",
  },
];

export function matchingCoachingTopics(query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return PROPERTY_TREATMENT_TOPICS.filter(topic => {
    const text = `${topic.category} ${topic.question} ${topic.say} ${topic.note} ${topic.keywords}`.toLowerCase();
    return words.every(word => text.includes(word));
  });
}
