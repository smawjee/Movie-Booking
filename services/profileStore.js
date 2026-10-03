const crypto = require("crypto");
const { supabase } = require("./supabaseClient");

// Profiles and SIMULATED verification. Real identity/student checks need a
// KYC provider; this reproduces the flow (submit → pending → decision) and
// the server-side rules (DOB consistency, age, academic email, code expiry,
// attempt limits) without one. Document files never leave the browser:
// only their name/type/size are checked and recorded.

const MIN_ACCOUNT_AGE = 13;
const REVIEW_MS = 3000;
const CODE_TTL_MS = 15 * 60000;
const MAX_CODE_ATTEMPTS = 5;
const STUDENT_VALID_DAYS = 365;
const STUDENT_EMAIL = /@([a-z0-9-]+\.)+(ac\.uk|edu|edu\.[a-z]{2}|ac\.[a-z]{2})$/i;
const DOCUMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

const httpError = (message, status) =>
  Object.assign(new Error(message), { status });

function ageOn(dob, now = new Date()) {
  const birth = new Date(`${dob}T12:00:00Z`);
  if (Number.isNaN(birth.valueOf()) || birth > now) return null;
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() &&
      now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age--;
  return age;
}

const ageBandFor = (age) =>
  age >= 18 ? "18-plus" : age >= 15 ? "15-17" : age >= 12 ? "12-14" : "under-12";

function checkDocument(document) {
  if (!document || typeof document !== "object")
    throw httpError("Add a photo or scan of your document", 400);
  if (!DOCUMENT_TYPES.has(document.type))
    throw httpError("Upload a JPG, PNG, WEBP, HEIC or PDF file", 400);
  if (!(document.size >= 10 * 1024))
    throw httpError("That file is too small to be a readable document photo", 400);
  if (document.size > 10 * 1024 * 1024)
    throw httpError("That file is over 10 MB", 400);
  return {
    name: String(document.name || "document").slice(0, 120),
    type: document.type,
    size: document.size,
  };
}

const hashCode = (userId, code) =>
  crypto.createHash("sha256").update(`${userId}:${code}`).digest("hex");

async function latestRequest(userId, kind) {
  const { data, error } = await supabase
    .from("verification_requests")
    .select("*")
    .eq("user_id", userId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function setProfile(userId, fields) {
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, ...fields });
  if (error) throw error;
}

// Completes a simulated review once its review time has passed.
async function settlePending(userId, profile) {
  const now = Date.now();
  for (const kind of ["identity", "student"]) {
    const pending =
      (kind === "identity" && profile.id_verification_status === "pending") ||
      (kind === "student" && profile.student_status === "pending");
    if (!pending) continue;
    const request = await latestRequest(userId, kind);
    if (!request || request.status !== "pending") continue;
    if (new Date(request.created_at).getTime() + REVIEW_MS > now) continue;
    const decidedAt = new Date().toISOString();
    await supabase
      .from("verification_requests")
      .update({ status: "verified", decided_at: decidedAt })
      .eq("id", request.id);
    if (kind === "identity") {
      await setProfile(userId, {
        id_verification_status: "verified",
        age_verified_at: decidedAt,
      });
      profile.id_verification_status = "verified";
      profile.age_verified_at = decidedAt;
    } else {
      const until = new Date(now + STUDENT_VALID_DAYS * 86400000).toISOString();
      await setProfile(userId, {
        student_status: "verified",
        student_verified_until: until,
      });
      profile.student_status = "verified";
      profile.student_verified_until = until;
    }
  }
  return profile;
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, date_of_birth, id_verification_status, age_verified_at, student_status, student_email, student_verified_until",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  const profile = data || {
    id: userId,
    full_name: null,
    date_of_birth: null,
    id_verification_status: "none",
    age_verified_at: null,
    student_status: "none",
    student_email: null,
    student_verified_until: null,
  };
  return settlePending(userId, profile);
}

const isStudent = (profile) =>
  profile?.student_status === "verified" &&
  (!profile.student_verified_until ||
    new Date(profile.student_verified_until) > new Date());

const isAgeVerified = (profile) =>
  profile?.id_verification_status === "verified" && Boolean(profile.date_of_birth);

function publicProfile(profile, user) {
  const age = profile.date_of_birth ? ageOn(profile.date_of_birth) : null;
  return {
    email: user?.email || null,
    fullName: profile.full_name,
    dateOfBirth: profile.date_of_birth,
    age,
    ageBand: age === null ? null : ageBandFor(age),
    identity: {
      status: profile.id_verification_status,
      verifiedAt: profile.age_verified_at,
    },
    student: {
      status: isStudent(profile)
        ? "verified"
        : profile.student_status === "verified"
          ? "expired"
          : profile.student_status,
      email: profile.student_email,
      verifiedUntil: profile.student_verified_until,
    },
  };
}

async function updateProfile(userId, { fullName, dateOfBirth }) {
  const current = await getProfile(userId);
  const fields = {};
  if (fullName !== undefined) fields.full_name = fullName;
  if (dateOfBirth !== undefined && dateOfBirth !== current.date_of_birth) {
    if (current.id_verification_status === "verified")
      throw httpError(
        "Your date of birth is locked after ID verification. Contact support to change it.",
        409,
      );
    const age = ageOn(dateOfBirth);
    if (age === null) throw httpError("Enter a valid date of birth", 400);
    if (age < MIN_ACCOUNT_AGE)
      throw httpError(`You must be ${MIN_ACCOUNT_AGE} or older to have an account`, 403);
    fields.date_of_birth = dateOfBirth;
  }
  if (Object.keys(fields).length) await setProfile(userId, fields);
  return getProfile(userId);
}

async function submitIdentity(userId, { documentType, dateOfBirth, document }) {
  const current = await getProfile(userId);
  if (current.id_verification_status === "verified")
    throw httpError("Your ID is already verified", 409);
  const file = checkDocument(document);
  const age = ageOn(dateOfBirth);
  if (age === null) throw httpError("Enter the date of birth shown on your ID", 400);
  if (current.date_of_birth && current.date_of_birth !== dateOfBirth) {
    await supabase.from("verification_requests").insert({
      user_id: userId,
      kind: "identity",
      status: "rejected",
      detail: { documentType, file, reason: "dob-mismatch" },
      decided_at: new Date().toISOString(),
    });
    await setProfile(userId, { id_verification_status: "rejected" });
    throw httpError(
      "The date of birth on your document doesn’t match your account. Check it and try again.",
      422,
    );
  }
  if (age < MIN_ACCOUNT_AGE)
    throw httpError(`You must be ${MIN_ACCOUNT_AGE} or older to verify`, 403);
  const { error } = await supabase.from("verification_requests").insert({
    user_id: userId,
    kind: "identity",
    status: "pending",
    detail: { documentType, file, simulated: true },
  });
  if (error) throw error;
  await setProfile(userId, {
    date_of_birth: dateOfBirth,
    id_verification_status: "pending",
  });
  return { status: "pending", reviewMs: REVIEW_MS };
}

async function startStudent(userId, { studentEmail, institution }, sendMessage) {
  const current = await getProfile(userId);
  if (isStudent(current)) throw httpError("You’re already a verified student", 409);
  const email = String(studentEmail).trim().toLowerCase();
  if (!STUDENT_EMAIL.test(email))
    throw httpError(
      "Use your university or college email (ending .ac.uk, .edu or similar)",
      400,
    );
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const { error } = await supabase.from("verification_requests").insert({
    user_id: userId,
    kind: "student",
    status: "code_sent",
    detail: { studentEmail: email, institution, simulated: true },
    code_hash: hashCode(userId, code),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) throw error;
  const delivery = await sendMessage({
    to: email,
    subject: `Your Cinego student verification code: ${code}`,
    text: `Your Cinego student verification code is ${code}. It expires in 15 minutes.`,
    html: `<p>Your Cinego student verification code is</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>It expires in 15 minutes. If you didn't ask for this, ignore this email.</p>`,
  });
  // Demo mode: with no email server configured the code is returned so the
  // flow can still be completed.
  return {
    status: "code_sent",
    sentTo: email,
    ...(delivery.status === "preview" && { demoCode: code }),
  };
}

async function confirmStudent(userId, { code, document }) {
  const request = await latestRequest(userId, "student");
  if (!request || request.status !== "code_sent")
    throw httpError("Request a new code first", 409);
  if (new Date(request.expires_at) < new Date())
    throw httpError("That code has expired. Request a new one.", 410);
  if (request.attempts >= MAX_CODE_ATTEMPTS)
    throw httpError("Too many attempts. Request a new code.", 429);
  const file = checkDocument(document);
  const expected = Buffer.from(request.code_hash, "hex");
  const given = Buffer.from(hashCode(userId, String(code).trim()), "hex");
  if (!crypto.timingSafeEqual(expected, given)) {
    await supabase
      .from("verification_requests")
      .update({ attempts: request.attempts + 1 })
      .eq("id", request.id);
    throw httpError("That code isn’t right. Check your email and try again.", 422);
  }
  // Close the email-code step; a fresh pending request (the document
  // review) starts its review timer now.
  await supabase
    .from("verification_requests")
    .update({ status: "verified", decided_at: new Date().toISOString() })
    .eq("id", request.id);
  const { error } = await supabase.from("verification_requests").insert({
    user_id: userId,
    kind: "student",
    status: "pending",
    detail: { ...request.detail, file, emailConfirmed: true },
  });
  if (error) throw error;
  await setProfile(userId, {
    student_status: "pending",
    student_email: request.detail.studentEmail,
  });
  return { status: "pending", reviewMs: REVIEW_MS };
}

module.exports = {
  ageOn,
  ageBandFor,
  getProfile,
  publicProfile,
  updateProfile,
  submitIdentity,
  startStudent,
  confirmStudent,
  isStudent,
  isAgeVerified,
  MIN_ACCOUNT_AGE,
};
