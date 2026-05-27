/**
 * Supabase bridge — Railway ↔ Lovable/Supabase
 * Reads Google tokens from Supabase, writes briefing results back.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL  = process.env.SUPABASE_URL  || 'https://gfwhrjzrdtfwodwzdxsq.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdmd2hyanpyZHRmd29kd3pkeHNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDQ0NzcsImV4cCI6MjA4NzcyMDQ3N30.BphVZOCd9wKw-o6SWcNRZ5OZ0BLfsVztQft--QD_HwA';
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// ── Admin client (service role) — reads/writes any user's data ─────────────
function getAdmin() {
  if (!SUPABASE_SERVICE_ROLE) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY non configurata. Aggiungila alle variabili Railway.');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

// ── Verify a Supabase JWT → returns { id, email } ─────────────────────────
async function verifyToken(jwt) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: { user }, error } = await client.auth.getUser(jwt);
  if (error || !user) throw new Error('Token Supabase non valido: ' + (error?.message || 'unknown'));
  return user; // { id (UUID), email, ... }
}

// ── Read Google tokens for a Supabase user ────────────────────────────────
async function getGoogleTokens(supabaseUserId) {
  const admin = getAdmin();
  const { data, error } = await admin
    .from('google_tokens')
    .select('access_token, refresh_token, expires_at, scopes')
    .eq('user_id', supabaseUserId)
    .single();
  if (error || !data) throw new Error('Google non connesso su Lovable. Vai in Impostazioni → Connetti Google.');
  // expires_at in Supabase is ISO string; convert to ms epoch for the agent
  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    new Date(data.expires_at).getTime(),
    scopes:        data.scopes || []
  };
}

// ── Update Google tokens after a refresh ─────────────────────────────────
async function updateGoogleTokens(supabaseUserId, { access_token, expires_at }) {
  try {
    const admin = getAdmin();
    await admin
      .from('google_tokens')
      .update({
        access_token,
        expires_at: new Date(expires_at).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', supabaseUserId);
  } catch (e) {
    console.warn('[supabase] Failed to update google tokens:', e.message);
  }
}

// ── Map Railway dayType + readiness → Lovable "mode" ────────────────────
function toMode(dayType, readinessScore) {
  if (readinessScore && readinessScore < 50) return 'Recovery';
  if (dayType === 'focus' || dayType === 'maker') return 'Peak';
  if (dayType === 'manager') return 'Balanced';
  return 'Balanced';
}

// ── Write morning briefing to Supabase daily_briefings ───────────────────
async function writeBriefing(supabaseUserId, agentResult) {
  const admin = getAdmin();
  const { date, insights, health, detectedCity } = agentResult;

  const mode    = toMode(insights?.dayType, health?.readinessScore);
  const summary = insights?.contextualIntelligence || insights?.growthBrief || '';
  const edge    = insights?.intelligenceFeed || '';
  const city    = detectedCity || 'Milano';

  // Build pillar_breakdown from agent data
  const pillar_breakdown = {};
  if (insights?.dayType) {
    pillar_breakdown['GROWTH'] = {
      focus:   insights.dayType === 'focus' ? 'Focus Day: blocchi di deep work ininterrotti' :
               insights.dayType === 'maker' ? 'Maker Day: deep work tra i meeting' :
               'Manager Day: decisioni rapide, email critiche',
      actions: []
    };
  }
  if (health) {
    pillar_breakdown['CALIBRATION'] = {
      focus:   `HRV ${health.hrv || '?'}ms · Readiness ${health.readinessScore || '?'}/100 · Stress ${health.stressLevel || '?'}`,
      actions: [
        health.recommendations?.activity || '',
        health.recommendations?.mindset  || ''
      ].filter(Boolean)
    };
  }

  // tommaso_thought from family context if available
  const tomAlerts = agentResult.tommasoAlerts || [];
  const tommaso_thought = tomAlerts.length
    ? tomAlerts[0].title
    : null;

  const { error } = await admin
    .from('daily_briefings')
    .upsert({
      user_id:         supabaseUserId,
      date:            date || new Date().toISOString().split('T')[0],
      mode,
      summary,
      city,
      competitive_edge: edge,
      tommaso_thought,
      pillar_breakdown
    }, { onConflict: 'user_id,date' });

  if (error) throw new Error('Errore scrittura briefing su Supabase: ' + error.message);
}

// ── Write tasks to Supabase tasks table ──────────────────────────────────
async function writeTasks(supabaseUserId, tasks) {
  if (!tasks?.length) return;
  const admin = getAdmin();

  // Map Railway task quadrant → Lovable pillar
  const pillarMap = { Q1: 'GROWTH', Q2: 'NEXT', Q3: 'INSIGHTS', Q4: 'HUMAN' };

  const rows = tasks.filter(t => !t._fromSupabase).map(t => ({
    user_id:   supabaseUserId,
    title:     t.title || t.subject || '',
    description: t.brief || null,
    pillar:    pillarMap[(t.quadrant || 'Q2').toUpperCase()] || 'GROWTH',
    priority:  t.quadrant === 'Q1' ? 'critical' : t.quadrant === 'Q2' ? 'high' : 'medium',
    completed: false,
    links:     t.link ? { source: t.link } : null
  }));

  if (!rows.length) return;
  const { error } = await admin.from('tasks').insert(rows);
  if (error) console.warn('[supabase] tasks insert error:', error.message);
}

module.exports = {
  verifyToken,
  getGoogleTokens,
  updateGoogleTokens,
  writeBriefing,
  writeTasks,
  getAdmin,
  SUPABASE_URL
};
