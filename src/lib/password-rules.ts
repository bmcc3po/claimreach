// First sign-in password rules. Used by /api/me/password and the set-password screen.
/** The starter passwords were name plus 123. Nothing like that is allowed back. */
export function passwordProblem(pw: string, email: string | null | undefined): string | null {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (/^[a-z]+\d{1,4}$/i.test(pw)) return "That is too close to the starter password. Add more to it.";
  const local = String(email || "").split("@")[0].toLowerCase();
  if (local && pw.toLowerCase().includes(local)) return "Leave your name or email out of it.";
  return null;
}

