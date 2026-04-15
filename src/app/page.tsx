'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Subcontractor = {
  id: number;
  company_name: string;
  trade: string | null;
  contact_name: string | null;
  subcontractor_email: string | null;
  agent_email: string | null;
  expiration_date: string | null;
  status: string | null;
  notes: string | null;
  gl_expiration_date: string | null;
  gl_agent_email: string | null;
  wc_expiration_date: string | null;
  wc_agent_email: string | null;
  icec_expiration_date: string | null;
  is_wc_exempt: boolean | null;
  last_requested_date: string | null;
  request_status: string | null;
};

type FormState = {
  company_name: string;
  trade: string;
  contact_name: string;
  subcontractor_email: string;
  notes: string;
  gl_expiration_date: string;
  gl_agent_email: string;
  wc_expiration_date: string;
  wc_agent_email: string;
  icec_expiration_date: string;
  is_wc_exempt: boolean;
};

type FilterType = 'all' | 'noncompliant' | 'expiringSoon' | 'compliant';

const emptyForm: FormState = {
  company_name: '',
  trade: '',
  contact_name: '',
  subcontractor_email: '',
  notes: '',
  gl_expiration_date: '',
  gl_agent_email: '',
  wc_expiration_date: '',
  wc_agent_email: '',
  icec_expiration_date: '',
  is_wc_exempt: false,
};

function getDaysUntil(dateString: string | null) {
  if (!dateString) return null;

  const today = new Date();
  const target = new Date(dateString);

  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diffMs = target.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getDocStatusLabel(daysLeft: number | null) {
  if (daysLeft === null) return 'Missing';
  if (daysLeft < 0) return `Expired ${Math.abs(daysLeft)} day(s) ago`;
  if (daysLeft === 0) return 'Expires today';
  if (daysLeft <= 30) return `Expires in ${daysLeft} day(s)`;
  return `Current - ${daysLeft} day(s) left`;
}

function getCompliance(sub: Subcontractor) {
  const glDays = getDaysUntil(sub.gl_expiration_date);
  const wcDays = getDaysUntil(sub.wc_expiration_date);
  const icecDays = getDaysUntil(sub.icec_expiration_date);
  const isExempt = !!sub.is_wc_exempt;

  const glCurrent = glDays !== null && glDays >= 0;
  const wcCurrent = wcDays !== null && wcDays >= 0;
  const icecCurrent = icecDays !== null && icecDays >= 0;

  const laborRequirementCurrent = isExempt ? icecCurrent : wcCurrent;
  const compliant = glCurrent && laborRequirementCurrent;

  let warning = '';

  if (!glCurrent) {
    warning = 'General Liability is missing or expired';
  } else if (isExempt && !icecCurrent) {
    warning = 'ICEC is missing or expired';
  } else if (!isExempt && !wcCurrent) {
    warning = "Workers' Comp is missing or expired";
  } else {
    warning = 'Compliant';
  }

  const expiringSoon =
    (glDays !== null && glDays >= 0 && glDays <= 30) ||
    (!isExempt && wcDays !== null && wcDays >= 0 && wcDays <= 30) ||
    (isExempt && icecDays !== null && icecDays >= 0 && icecDays <= 30);

  return {
    compliant,
    warning,
    expiringSoon,
    glDays,
    wcDays,
    icecDays,
    isExempt,
  };
}

function getNearestRelevantDays(sub: Subcontractor) {
  const compliance = getCompliance(sub);
  const dates: number[] = [];

  if (compliance.glDays !== null) dates.push(compliance.glDays);

  if (compliance.isExempt) {
    if (compliance.icecDays !== null) dates.push(compliance.icecDays);
  } else {
    if (compliance.wcDays !== null) dates.push(compliance.wcDays);
  }

  if (dates.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...dates);
}

function buildMailtoLink(sub: Subcontractor) {
  const recipients = [
    sub.subcontractor_email,
    sub.gl_agent_email,
    sub.wc_agent_email,
  ]
    .filter(Boolean)
    .join(';');

  const subject = `Updated Insurance Request - ${sub.company_name}`;

  const laborDocText = sub.is_wc_exempt
    ? `Please also send a current ICEC exemption document.`
    : `Please also send a current Workers' Comp certificate.`;

  const body = `Hello,

Our records show that we need updated insurance documentation for ${sub.company_name}.

Please send a current Certificate of General Liability Insurance.
${laborDocText}

Please have the Certificate Holder read exactly as follows:

Mountain Ridge Construction, LLC dba Frontier Builders
20 W 2nd St.
Whitefish, MT 59937

Thank you.`;

  return `mailto:${recipients}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const styles = {
  page: {
    maxWidth: '1100px',
    margin: '40px auto',
    padding: '24px',
    fontFamily: 'Arial, sans-serif',
    color: '#111827',
  } as React.CSSProperties,
  title: {
    marginBottom: '6px',
    fontSize: '32px',
  } as React.CSSProperties,
  subtitle: {
    marginTop: 0,
    marginBottom: '24px',
    color: '#4b5563',
  } as React.CSSProperties,
  dashboard: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '14px',
    marginBottom: '22px',
  } as React.CSSProperties,
  statCardBase: {
    borderRadius: '14px',
    padding: '18px',
  } as React.CSSProperties,
  filterRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginBottom: '24px',
  } as React.CSSProperties,
  formCard: {
    border: '1px solid #d1d5db',
    borderRadius: '16px',
    padding: '22px',
    marginBottom: '32px',
    backgroundColor: '#ffffff',
  } as React.CSSProperties,
  sectionTitle: {
    margin: '4px 0 10px 0',
    fontSize: '18px',
  } as React.CSSProperties,
  formGrid: {
    display: 'grid',
    gap: '12px',
  } as React.CSSProperties,
  input: {
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid #cbd5e1',
    fontSize: '15px',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  textarea: {
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid #cbd5e1',
    fontSize: '15px',
    width: '100%',
    minHeight: '90px',
    boxSizing: 'border-box' as const,
  },
  cardGrid: {
    display: 'grid',
    gap: '18px',
    marginTop: '18px',
  } as React.CSSProperties,
  cardBase: {
    borderRadius: '16px',
    padding: '20px',
  } as React.CSSProperties,
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    flexWrap: 'wrap',
  } as React.CSSProperties,
  companyTitle: {
    margin: 0,
    fontSize: '24px',
  } as React.CSSProperties,
  badge: {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '13px',
    fontWeight: 'bold',
  } as React.CSSProperties,
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '18px',
    marginTop: '16px',
  } as React.CSSProperties,
  infoBlock: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: '12px',
    padding: '14px',
  } as React.CSSProperties,
  label: {
    fontSize: '12px',
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    marginBottom: '4px',
  } as React.CSSProperties,
  value: {
    marginBottom: '10px',
  } as React.CSSProperties,
  actionRow: {
    marginTop: '16px',
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  } as React.CSSProperties,
  buttonPrimary: {
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid #111827',
    backgroundColor: '#111827',
    color: '#ffffff',
    cursor: 'pointer',
  } as React.CSSProperties,
  buttonSecondary: {
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid #9ca3af',
    backgroundColor: '#ffffff',
    color: '#111827',
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-block',
  } as React.CSSProperties,
};

export default function HomePage() {
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  async function loadSubcontractors() {
    const { data, error } = await supabase.from('subcontractors').select('*');

    if (error) {
      console.error('Error loading subcontractors:', error);
    } else {
      setSubs(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadSubcontractors();
  }, []);

  function startEdit(sub: Subcontractor) {
    setEditingId(sub.id);
    setForm({
      company_name: sub.company_name || '',
      trade: sub.trade || '',
      contact_name: sub.contact_name || '',
      subcontractor_email: sub.subcontractor_email || '',
      notes: sub.notes || '',
      gl_expiration_date: sub.gl_expiration_date || '',
      gl_agent_email: sub.gl_agent_email || '',
      wc_expiration_date: sub.wc_expiration_date || '',
      wc_agent_email: sub.wc_agent_email || '',
      icec_expiration_date: sub.icec_expiration_date || '',
      is_wc_exempt: !!sub.is_wc_exempt,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload = {
      company_name: form.company_name,
      trade: form.trade || null,
      contact_name: form.contact_name || null,
      subcontractor_email: form.subcontractor_email || null,
      notes: form.notes || null,
      gl_expiration_date: form.gl_expiration_date || null,
      gl_agent_email: form.gl_agent_email || null,
      wc_expiration_date: form.wc_expiration_date || null,
      wc_agent_email: form.wc_agent_email || null,
      icec_expiration_date: form.icec_expiration_date || null,
      is_wc_exempt: form.is_wc_exempt,
    };

    if (editingId !== null) {
      const { error } = await supabase
        .from('subcontractors')
        .update(payload)
        .eq('id', editingId);

      if (error) {
        console.error('Error updating subcontractor:', error);
        alert(`Update failed: ${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase.from('subcontractors').insert([payload]);

      if (error) {
        console.error('Error adding subcontractor:', error);
        alert(`Add failed: ${error.message}`);
        return;
      }
    }

    setForm(emptyForm);
    setEditingId(null);
    loadSubcontractors();
  }

  async function handleDelete(id: number) {
    const confirmed = window.confirm(
      'Are you sure you want to delete this subcontractor record?'
    );
    if (!confirmed) return;

    const { error } = await supabase.from('subcontractors').delete().eq('id', id);

    if (error) {
      console.error('Error deleting subcontractor:', error);
      alert(`Delete failed: ${error.message}`);
      return;
    }

    if (editingId === id) {
      setEditingId(null);
      setForm(emptyForm);
    }

    loadSubcontractors();
  }

  async function markRequestSent(id: number) {
    const today = new Date().toISOString().split('T')[0];

    const { error } = await supabase
      .from('subcontractors')
      .update({
        last_requested_date: today,
        request_status: 'Requested',
      })
      .eq('id', id);

    if (error) {
      console.error('Error marking request sent:', error);
      alert(`Mark request failed: ${error.message}`);
      return;
    }

    loadSubcontractors();
  }

  const noncompliantCount = subs.filter((sub) => !getCompliance(sub).compliant).length;
  const expiringSoonCount = subs.filter((sub) => {
    const c = getCompliance(sub);
    return c.compliant && c.expiringSoon;
  }).length;
  const compliantCount = subs.filter((sub) => {
    const c = getCompliance(sub);
    return c.compliant && !c.expiringSoon;
  }).length;

  const filteredSubs = useMemo(() => {
    let results = [...subs];

    switch (activeFilter) {
      case 'noncompliant':
        results = results.filter((sub) => !getCompliance(sub).compliant);
        break;
      case 'expiringSoon':
        results = results.filter((sub) => {
          const c = getCompliance(sub);
          return c.compliant && c.expiringSoon;
        });
        break;
      case 'compliant':
        results = results.filter((sub) => {
          const c = getCompliance(sub);
          return c.compliant && !c.expiringSoon;
        });
        break;
      default:
        break;
    }

    results.sort((a, b) => getNearestRelevantDays(a) - getNearestRelevantDays(b));
    return results;
  }, [subs, activeFilter]);

  function getFilterButtonStyle(filter: FilterType): React.CSSProperties {
    const active = activeFilter === filter;
    return {
      ...styles.buttonSecondary,
      border: active ? '2px solid #111827' : '1px solid #cbd5e1',
      fontWeight: active ? 'bold' : 'normal',
      backgroundColor: active ? '#f3f4f6' : '#ffffff',
    };
  }

  function getStatusBadge(sub: Subcontractor) {
    const c = getCompliance(sub);

    if (!c.compliant) {
      return {
        text: 'Noncompliant',
        style: { ...styles.badge, backgroundColor: '#fee2e2', color: '#991b1b' },
      };
    }

    if (c.expiringSoon) {
      return {
        text: 'Expiring Soon',
        style: { ...styles.badge, backgroundColor: '#fef3c7', color: '#92400e' },
      };
    }

    return {
      text: 'Compliant',
      style: { ...styles.badge, backgroundColor: '#dcfce7', color: '#166534' },
    };
  }

  function getCardStyle(sub: Subcontractor): React.CSSProperties {
    const c = getCompliance(sub);

    if (!c.compliant) {
      return { ...styles.cardBase, border: '1px solid #f87171', backgroundColor: '#fef2f2' };
    }

    if (c.expiringSoon) {
      return { ...styles.cardBase, border: '1px solid #fbbf24', backgroundColor: '#fffbeb' };
    }

    return { ...styles.cardBase, border: '1px solid #4ade80', backgroundColor: '#f0fdf4' };
  }

  return (
    <main style={styles.page}>
      <h1 style={styles.title}>COI Tracker</h1>
      <p style={styles.subtitle}>
        Track General Liability and either Workers&apos; Comp or ICEC exemption.
      </p>

      <div style={styles.dashboard}>
        <div style={{ ...styles.statCardBase, border: '1px solid #f87171', backgroundColor: '#fef2f2' }}>
          <div style={styles.label}>Noncompliant</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{noncompliantCount}</div>
        </div>
        <div style={{ ...styles.statCardBase, border: '1px solid #fbbf24', backgroundColor: '#fffbeb' }}>
          <div style={styles.label}>Expiring Soon</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{expiringSoonCount}</div>
        </div>
        <div style={{ ...styles.statCardBase, border: '1px solid #4ade80', backgroundColor: '#f0fdf4' }}>
          <div style={styles.label}>Compliant</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{compliantCount}</div>
        </div>
      </div>

      <div style={styles.filterRow}>
        <button type="button" style={getFilterButtonStyle('all')} onClick={() => setActiveFilter('all')}>All</button>
        <button type="button" style={getFilterButtonStyle('noncompliant')} onClick={() => setActiveFilter('noncompliant')}>Noncompliant</button>
        <button type="button" style={getFilterButtonStyle('expiringSoon')} onClick={() => setActiveFilter('expiringSoon')}>Expiring Soon</button>
        <button type="button" style={getFilterButtonStyle('compliant')} onClick={() => setActiveFilter('compliant')}>Compliant</button>
      </div>

      <form onSubmit={handleSubmit} style={styles.formCard}>
        <h2 style={styles.sectionTitle}>
          {editingId !== null ? 'Edit Subcontractor' : 'Add Subcontractor'}
        </h2>

        <div style={styles.formGrid}>
          <input style={styles.input} placeholder="Company name" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} required />
          <input style={styles.input} placeholder="Trade" value={form.trade} onChange={(e) => setForm({ ...form, trade: e.target.value })} />
          <input style={styles.input} placeholder="Contact name" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
          <input style={styles.input} placeholder="Subcontractor email" value={form.subcontractor_email} onChange={(e) => setForm({ ...form, subcontractor_email: e.target.value })} />

          <h3 style={styles.sectionTitle}>General Liability</h3>
          <input style={styles.input} type="date" value={form.gl_expiration_date} onChange={(e) => setForm({ ...form, gl_expiration_date: e.target.value })} required />
          <input style={styles.input} placeholder="General Liability agent email" value={form.gl_agent_email} onChange={(e) => setForm({ ...form, gl_agent_email: e.target.value })} />

          <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input type="checkbox" checked={form.is_wc_exempt} onChange={(e) => setForm({ ...form, is_wc_exempt: e.target.checked })} />
            Workers&apos; Comp exempt
          </label>

          {form.is_wc_exempt ? (
            <>
              <h3 style={styles.sectionTitle}>ICEC</h3>
              <input style={styles.input} type="date" value={form.icec_expiration_date} onChange={(e) => setForm({ ...form, icec_expiration_date: e.target.value })} />
            </>
          ) : (
            <>
              <h3 style={styles.sectionTitle}>Workers&apos; Comp</h3>
              <input style={styles.input} type="date" value={form.wc_expiration_date} onChange={(e) => setForm({ ...form, wc_expiration_date: e.target.value })} />
              <input style={styles.input} placeholder="Workers' Comp agent email" value={form.wc_agent_email} onChange={(e) => setForm({ ...form, wc_agent_email: e.target.value })} />
            </>
          )}

          <textarea style={styles.textarea} placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

          <div style={styles.actionRow}>
            <button type="submit" style={styles.buttonPrimary}>
              {editingId !== null ? 'Update Subcontractor' : 'Add Subcontractor'}
            </button>

            {editingId !== null && (
              <button type="button" style={styles.buttonSecondary} onClick={cancelEdit}>
                Cancel Edit
              </button>
            )}
          </div>
        </div>
      </form>

      <h2 style={styles.sectionTitle}>
        Subcontractors <span style={{ fontWeight: 'normal', color: '#6b7280' }}>({filteredSubs.length} shown)</span>
      </h2>

      {loading ? (
        <p>Loading...</p>
      ) : filteredSubs.length === 0 ? (
        <p>No subcontractors match this filter.</p>
      ) : (
        <div style={styles.cardGrid}>
          {filteredSubs.map((sub) => {
            const c = getCompliance(sub);
            const badge = getStatusBadge(sub);

            return (
              <div key={sub.id} style={getCardStyle(sub)}>
                <div style={styles.topRow}>
                  <div>
                    <h3 style={styles.companyTitle}>{sub.company_name}</h3>
                    <div style={{ color: '#4b5563', marginTop: '4px' }}>{sub.trade || 'No trade listed'}</div>
                  </div>
                  <span style={badge.style}>{badge.text}</span>
                </div>

                <div style={{ marginTop: '12px', fontWeight: 'bold', color: '#374151' }}>
                  {c.warning}
                </div>

                <div style={styles.detailGrid}>
                  <div style={styles.infoBlock}>
                    <div style={styles.label}>Company Info</div>
                    <div style={styles.value}><strong>Contact:</strong> {sub.contact_name || '—'}</div>
                    <div style={styles.value}><strong>Sub email:</strong> {sub.subcontractor_email || '—'}</div>
                    <div style={styles.value}><strong>Last requested:</strong> {sub.last_requested_date || '—'}</div>
                    <div style={styles.value}><strong>Request status:</strong> {sub.request_status || 'Not Requested'}</div>
                  </div>

                  <div style={styles.infoBlock}>
                    <div style={styles.label}>General Liability</div>
                    <div style={styles.value}><strong>Status:</strong> {getDocStatusLabel(c.glDays)}</div>
                    <div style={styles.value}><strong>Expiration:</strong> {sub.gl_expiration_date || '—'}</div>
                    <div style={styles.value}><strong>Agent email:</strong> {sub.gl_agent_email || '—'}</div>
                  </div>

                  <div style={styles.infoBlock}>
                    <div style={styles.label}>Workers' Comp / ICEC</div>
                    <div style={styles.value}><strong>WC exempt:</strong> {c.isExempt ? 'Yes' : 'No'}</div>

                    {c.isExempt ? (
                      <>
                        <div style={styles.value}><strong>ICEC status:</strong> {getDocStatusLabel(c.icecDays)}</div>
                        <div style={styles.value}><strong>ICEC expiration:</strong> {sub.icec_expiration_date || '—'}</div>
                      </>
                    ) : (
                      <>
                        <div style={styles.value}><strong>WC status:</strong> {getDocStatusLabel(c.wcDays)}</div>
                        <div style={styles.value}><strong>WC expiration:</strong> {sub.wc_expiration_date || '—'}</div>
                        <div style={styles.value}><strong>WC agent email:</strong> {sub.wc_agent_email || '—'}</div>
                      </>
                    )}
                  </div>

                  <div style={styles.infoBlock}>
                    <div style={styles.label}>Notes</div>
                    <div>{sub.notes || '—'}</div>
                  </div>
                </div>

                <div style={styles.actionRow}>
                  {(sub.subcontractor_email || sub.gl_agent_email || sub.wc_agent_email) && (
                    <>
                      <a href={buildMailtoLink(sub)} style={styles.buttonSecondary}>
                        Request Updated Insurance
                      </a>

                      <button type="button" style={styles.buttonSecondary} onClick={() => markRequestSent(sub.id)}>
                        Mark Request Sent
                      </button>
                    </>
                  )}

                  <button type="button" style={styles.buttonSecondary} onClick={() => startEdit(sub)}>
                    Edit
                  </button>

                  <button type="button" style={styles.buttonSecondary} onClick={() => handleDelete(sub.id)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}