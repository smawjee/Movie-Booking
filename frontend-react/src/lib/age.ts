export const MIN_ACCOUNT_AGE = 13;

/** Whole years old today for an ISO date of birth, or null if invalid. */
export function ageFrom(dob: string, now = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const birth = new Date(`${dob}T12:00:00`);
  if (Number.isNaN(birth.valueOf()) || birth > now) return null;
  let age = now.getFullYear() - birth.getFullYear();
  if (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()))
    age--;
  return age > 120 ? null : age;
}

export const ageBandFor = (age: number) =>
  age >= 18 ? "18-plus" : age >= 15 ? "15-17" : age >= 12 ? "12-14" : "under-12";

export const minimumAgeFor = (rating: string) =>
  rating === "18" ? 18 : rating === "15" ? 15 : rating === "12A" ? 12 : 0;

/** Latest allowed date of birth for someone aged `years` today. */
export function latestDob(years: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toLocaleDateString("en-CA");
}

export function passwordStrength(password: string) {
  const checks = [
    { ok: password.length >= 8, label: "At least 8 characters" },
    { ok: /[a-z]/.test(password) && /[A-Z]/.test(password), label: "Upper and lower case" },
    { ok: /\d/.test(password), label: "A number" },
    { ok: /[^A-Za-z0-9]/.test(password), label: "A symbol" },
  ];
  const score = checks.filter((c) => c.ok).length;
  return {
    checks,
    score,
    label: ["Too weak", "Weak", "Fair", "Good", "Strong"][score],
    acceptable: checks[0].ok && score >= 3,
  };
}
