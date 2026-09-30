import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { isInternalRole } from "@/lib/permissions";
export const runtime = "edge";

const needsPersonalPassword = (role: string) => role !== "owner" && isInternalRole(role);

async function requireOwner(sb: any) {
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return { error: "unauthorized", status: 401 };
  const { data: me } = await sb.from("app_users").select("role, firm_id, active").eq("id", auth.user.id).maybeSingle();
  // The INNO MVA pilot reserves user management for the active owner. This
  // route writes through the service role, so it must enforce that boundary
  // itself even when a non-owner has a legacy users.manage override.
  const canManage = me?.active === true && me.role === "owner";
  if (!canManage) return { error: "forbidden", status: 403 };
  return { me, uid: auth.user.id };
}

export async function GET(req: NextRequest) {
  try {
    const sb = await supabaseServer();
    const gate = await requireOwner(sb);
    if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const { data, error } = await sb.from("app_users")
      .select("id, full_name, email, role, title, phone, active, perm_overrides, firm_id, created_at")
      .order("created_at", { ascending: false });
    if (error || !Array.isArray(data)) {
      return NextResponse.json({ error: "Could not load staff accounts. Please retry." }, { status: 500 });
    }
    return NextResponse.json({ users: data }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load staff accounts. Please retry." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const gate = await requireOwner(sb);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const me = (gate as any).me;
  const b = await req.json();
  const admin = supabaseAdmin();

  if (b.op === "create") {
    const email = (b.email || "").trim().toLowerCase();
    if (!email || !b.password) return NextResponse.json({ error: "email and password required" }, { status: 400 });
    const role = b.role ?? "agent";
    const temporary = needsPersonalPassword(role);
    // Create the auth user (confirmed) via the admin API.
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password: b.password, email_confirm: true,
      ...(temporary ? { app_metadata: { must_change_password: true } } : {}),
    });
    if (cErr || !created?.user) return NextResponse.json({ error: cErr?.message || "could not create auth user" }, { status: 500 });
    // Create the app_users profile row.
    const { error: pErr } = await admin.from("app_users").insert({
      id: created.user.id, email, full_name: b.full_name ?? email,
      role, title: b.title ?? null, phone: b.phone ?? null,
      firm_id: b.firm_id ?? me.firm_id, perm_overrides: b.perm_overrides ?? {}, active: true,
    });
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    // Do not announce a new staff account until its saved profile is readable.
    // If verification fails, preserve the login and profile for recovery.
    try {
      const { data: profile, error: verifyError } = await admin.from("app_users")
        .select("id, email").eq("id", created.user.id).maybeSingle();
      if (verifyError || !profile || profile.id !== created.user.id || profile.email !== email) {
        return NextResponse.json({ error: "The login was created, but ClaimReach could not verify its staff profile. Refresh Users before trying again." }, { status: 502 });
      }
      if (temporary) {
        const { data: checked, error: authError } = await admin.auth.admin.getUserById(created.user.id);
        if (authError || checked?.user?.id !== created.user.id || checked.user.email?.toLowerCase() !== email
          || checked.user.app_metadata?.must_change_password !== true) {
          return NextResponse.json({ error: "The staff account was created, but its required first-sign-in password change could not be verified. Refresh Users before trying again." }, { status: 502 });
        }
      }
    } catch {
      return NextResponse.json({ error: "The login was created, but ClaimReach could not verify its staff profile. Refresh Users before trying again." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, id: created.user.id });
  }

  if (b.op === "update") {
    const patch: Record<string, any> = {};
    for (const k of ["full_name", "role", "title", "phone", "active", "perm_overrides", "firm_id"]) if (k in b) patch[k] = b[k];
    const { error } = await admin.from("app_users").update(patch).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (b.op === "update_email") {
    const email = String(b.email || "").trim().toLowerCase();
    const expectedEmail = String(b.expected_email || "").trim().toLowerCase();
    if (!b.id || !expectedEmail || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "An account ID, current email and valid new email are required." }, { status: 400 });
    }
    const incomplete = "The login email change could not be fully verified. Retry this same email change to finish it; do not create another account.";
    try {
      const { data: profile, error: profileError } = await admin.from("app_users")
        .select("id, email, role, active").eq("id", b.id).maybeSingle();
      if (profileError) return NextResponse.json({ error: "Could not verify this account. No email was changed." }, { status: 503 });
      if (!profile || profile.id !== b.id) return NextResponse.json({ error: "Account not found." }, { status: 404 });
      if (profile.active !== true || !needsPersonalPassword(profile.role)) {
        return NextResponse.json({ error: "Login email changes here are limited to active internal staff." }, { status: 403 });
      }
      if (![expectedEmail, email].includes(String(profile.email).toLowerCase())) {
        return NextResponse.json({ error: "This account's email changed since it was opened. Refresh Users first." }, { status: 409 });
      }
      const { data: current, error: currentError } = await admin.auth.admin.getUserById(profile.id);
      if (currentError || current?.user?.id !== profile.id) {
        return NextResponse.json({ error: "Could not verify the existing login. No email was changed." }, { status: 503 });
      }
      const authEmail = String(current.user.email || "").toLowerCase();
      if (![expectedEmail, email].includes(authEmail)) {
        return NextResponse.json({ error: "The login has a different email. Refresh Users before making another change." }, { status: 409 });
      }
      // Auth and app_users cannot share a transaction. Keep the UUID fixed and
      // make retry repair the same change if Auth succeeded before a DB failure.
      // Never roll Auth back or copy permissions from the request body.
      if (authEmail !== email) {
        const { error: authError } = await admin.auth.admin.updateUserById(profile.id, { email, email_confirm: true });
        if (authError) return NextResponse.json({ error: authError.message || "Login email change failed." }, { status: 400 });
      }
      const { data: checked, error: checkError } = await admin.auth.admin.getUserById(profile.id);
      if (checkError || checked?.user?.id !== profile.id || checked.user.email?.toLowerCase() !== email) {
        return NextResponse.json({ error: incomplete }, { status: 502 });
      }
      const { data: saved, error: saveError } = await admin.from("app_users")
        .update({ email }).eq("id", profile.id).eq("email", profile.email).select("id, email").maybeSingle();
      if (saveError || !saved || saved.id !== profile.id || saved.email?.toLowerCase() !== email) {
        return NextResponse.json({ error: incomplete }, { status: 502 });
      }
      const { data: finalAuth, error: finalError } = await admin.auth.admin.getUserById(profile.id);
      if (finalError || finalAuth?.user?.id !== profile.id || finalAuth.user.email?.toLowerCase() !== email) {
        return NextResponse.json({ error: incomplete }, { status: 502 });
      }
      return NextResponse.json({ ok: true, id: profile.id, email });
    } catch {
      return NextResponse.json({ error: incomplete }, { status: 502 });
    }
  }

  if (b.op === "set_password") {
    if (!b.id || !b.password) return NextResponse.json({ error: "id and password required" }, { status: 400 });
    try {
      // Identify the saved profile before touching Auth. A staff reset requires
      // a new personal password; owner and external onboarding stay unchanged.
      const { data: profile, error: profileError } = await admin.from("app_users")
        .select("id, email, role").eq("id", b.id).maybeSingle();
      if (profileError) return NextResponse.json({ error: "Could not verify this account. No password was changed." }, { status: 503 });
      if (!profile || profile.id !== b.id) return NextResponse.json({ error: "This account was not found. No password was changed." }, { status: 404 });
      const temporary = needsPersonalPassword(profile.role);
      let metadata: Record<string, any> | undefined;
      if (temporary) {
        const { data: current, error: currentError } = await admin.auth.admin.getUserById(profile.id);
        if (currentError || current?.user?.id !== profile.id || current.user.email?.toLowerCase() !== profile.email?.toLowerCase()) {
          return NextResponse.json({ error: "Could not verify the staff login matches its profile. No password was changed." }, { status: 503 });
        }
        metadata = { ...(current.user.app_metadata || {}), must_change_password: true };
      }
      const { error } = await admin.auth.admin.updateUserById(profile.id, {
        password: b.password,
        ...(temporary ? { app_metadata: metadata } : {}),
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (temporary) {
        const { data: checked, error: verifyError } = await admin.auth.admin.getUserById(profile.id);
        if (verifyError || checked?.user?.id !== profile.id || checked.user.email?.toLowerCase() !== profile.email?.toLowerCase()
          || checked.user.app_metadata?.must_change_password !== true) {
          return NextResponse.json({ error: "The password was changed, but its required first-sign-in password change could not be verified. Refresh Users before trying again." }, { status: 502 });
        }
      }
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: "Could not confirm the password operation. Refresh Users before trying again." }, { status: 502 });
    }
  }

  if (b.op === "deactivate") {
    const { error } = await admin.from("app_users").update({ active: false }).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Ban at auth level too so the login itself dies. The app already treats
    // active=false as signed out, so a failed ban is a warning, not a lie.
    let warn: string | null = null;
    try { const { error: bErr } = await admin.auth.admin.updateUserById(b.id, { ban_duration: "876000h" }); if (bErr) warn = `Deactivated, but the login ban failed: ${bErr.message}`; }
    catch (e: any) { warn = `Deactivated, but the login ban failed: ${e?.message || e}`; }
    return NextResponse.json({ ok: true, warning: warn });
  }
  if (b.op === "reactivate") {
    const { error } = await admin.from("app_users").update({ active: true }).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    let warn: string | null = null;
    try { const { error: bErr } = await admin.auth.admin.updateUserById(b.id, { ban_duration: "none" }); if (bErr) warn = `Reactivated, but lifting the login ban failed: ${bErr.message}. They may still be unable to log in.`; }
    catch (e: any) { warn = `Reactivated, but lifting the login ban failed: ${e?.message || e}.`; }
    return NextResponse.json({ ok: true, warning: warn });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
