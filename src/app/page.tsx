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

function getCardStyle(sub: Subcontractor): React.CSSProperties {
  const compliance = getCompliance(sub);

  if (!compliance.compliant) {
    return {
      border: '1px solid #dc2626',
      borderRadius: '12px',
      padding: '16px',
      backgroundColor: '#fef2f2',
    };
  }

  if (compliance.expiringSoon) {
    return {
      border: '1px solid #f59e0b',
      borderRadius: '12px',
      padding: '16px',
      backgroundColor: '#fffbeb',
    };
  }

  return {
    border: '1px solid #16a34a',
    borderRadius: '12px',
    padding: '16px',
    backgroundColor: '#f0fdf4',
  };
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

export default function HomePage() {
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  async function loadSubcontractors() {
    const { data, error } = await supabase
      .from('subcontractors')
      .select('*');

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

  const expiredCount = subs.filter((sub) => !getCompliance(sub).compliant).length;

  const expiringSoonCount = subs.filter((sub) => {
    const c = getCompliance(sub);
    return c.compliant && c.expiringSoon;
  }).length;

  const currentCount = subs.filter((sub) => {
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
      case 'all':
      default:
        break;
    }

    results.sort((a, b) => getNearestRelevantDays(a) - getNearestRelevantDays(b));
    return results;
  }, [subs, activeFilter]);

  function getFilterButtonStyle(filter: FilterType): React.CSSProperties {
    const isActive = activeFilter === filter;

    return {
      padding: '10px 14px',
      borderRadius: '8px',
      border: isActive ? '2px solid #111' : '1px solid #999',
      backgroundColor: isActive ? '#e5e7eb' : '#fff',
      fontWeight: isActive ? 'bold' : 'normal',
      cursor: 'pointer',
    };
  }

  return (
    <main style={{ maxWidth: '1000px', margin: '40px auto', padding: '20px' }}>
      <h1>COI Tracker</h1>
      <p>
        Track General Liability and either Workers&apos; Comp or ICEC exemption.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          marginTop: '20px',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            border: '1px solid #dc2626',
            borderRadius: '12px',
            padding: '16px',
            backgroundColor: '#fef2f2',
          }}
        >
          <h3 style={{ margin: 0 }}>Noncompliant</h3>
          <p style={{ fontSize: '28px', fontWeight: 'bold', margin: '8px 0 0 0' }}>
            {expiredCount}
          </p>
        </div>

        <div
          style={{
            border: '1px solid #f59e0b',
            borderRadius: '12px',
            padding: '16px',
            backgroundColor: '#fffbeb',
          }}
        >
          <h3 style={{ margin: 0 }}>Expiring Soon</h3>
          <p style={{ fontSize: '28px', fontWeight: 'bold', margin: '8px 0 0 0' }}>
            {expiringSoonCount}
          </p>
        </div>

        <div
          style={{
            border: '1px solid #16a34a',
            borderRadius: '12px',
            padding: '16px',
            backgroundColor: '#f0fdf4',
          }}
        >
          <h3 style={{ margin: 0 }}>Compliant</h3>
          <p style={{ fontSize: '28px', fontWeight: 'bold', margin: '8px 0 0 0' }}>
            {currentCount}
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
          marginBottom: '24px',
        }}
      >
        <button type="button" style={getFilterButtonStyle('all')} onClick={() => setActiveFilter('all')}>
          All
        </button>
        <button
          type="button"
          style={getFilterButtonStyle('noncompliant')}
          onClick={() => setActiveFilter('noncompliant')}
        >
          Noncompliant
        </button>
        <button
          type="button"
          style={getFilterButtonStyle('expiringSoon')}
          onClick={() => setActiveFilter('expiringSoon')}
        >
          Expiring Soon
        </button>
        <button
          type="button"
          style={getFilterButtonStyle('compliant')}
          onClick={() => setActiveFilter('compliant')}
        >
          Compliant
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'grid',
          gap: '12px',
          marginTop: '24px',
          marginBottom: '40px',
          padding: '20px',
          border: editingId !== null ? '2px solid #2563eb' : '1px solid #ccc',
          borderRadius: '12px',
        }}
      >
        {editingId !== null && (
          <p style={{ margin: 0, fontWeight: 'bold', color: '#1d4ed8' }}>
            Editing subcontractor record
          </p>
        )}

        <input
          placeholder="Company name"
          value={form.company_name}
          onChange={(e) => setForm({ ...form, company_name: e.target.value })}
          required
        />

        <input
          placeholder="Trade"
          value={form.trade}
          onChange={(e) => setForm({ ...form, trade: e.target.value })}
        />

        <input
          placeholder="Contact name"
          value={form.contact_name}
          onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
        />

        <input
          placeholder="Subcontractor email"
          value={form.subcontractor_email}
          onChange={(e) =>
            setForm({ ...form, subcontractor_email: e.target.value })
          }
        />

        <h3 style={{ marginBottom: 0 }}>General Liability</h3>
        <input
          type="date"
          value={form.gl_expiration_date}
          onChange={(e) =>
            setForm({ ...form, gl_expiration_date: e.target.value })
          }
          required
        />
        <input
          placeholder="General Liability agent email"
          value={form.gl_agent_email}
          onChange={(e) => setForm({ ...form, gl_agent_email: e.target.value })}
        />

        <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={form.is_wc_exempt}
            onChange={(e) =>
              setForm({ ...form, is_wc_exempt: e.target.checked })
            }
          />
          Workers&apos; Comp exempt
        </label>

        {form.is_wc_exempt ? (
          <>
            <h3 style={{ marginBottom: 0 }}>ICEC</h3>
            <input
              type="date"
              value={form.icec_expiration_date}
              onChange={(e) =>
                setForm({ ...form, icec_expiration_date: e.target.value })
              }
            />
          </>
        ) : (
          <>
            <h3 style={{ marginBottom: 0 }}>Workers&apos; Comp</h3>
            <input
              type="date"
              value={form.wc_expiration_date}
              onChange={(e) =>
                setForm({ ...form, wc_expiration_date: e.target.value })
              }
            />
            <input
              placeholder="Workers' Comp agent email"
              value={form.wc_agent_email}
              onChange={(e) =>
                setForm({ ...form, wc_agent_email: e.target.value })
              }
            />
          </>
        )}

        <textarea
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button type="submit">
            {editingId !== null ? 'Update subcontractor' : 'Add subcontractor'}
          </button>

          {editingId !== null && (
            <button type="button" onClick={cancelEdit}>
              Cancel edit
            </button>
          )}
        </div>
      </form>

      <h2>
        Subcontractors{' '}
        <span style={{ fontWeight: 'normal', fontSize: '16px' }}>
          ({filteredSubs.length} shown)
        </span>
      </h2>

      {loading ? (
        <p>Loading...</p>
      ) : filteredSubs.length === 0 ? (
        <p>No subcontractors match this filter.</p>
      ) : (
        <div style={{ display: 'grid', gap: '16px', marginTop: '20px' }}>
          {filteredSubs.map((sub) => {
            const compliance = getCompliance(sub);

            return (
              <div key={sub.id} style={getCardStyle(sub)}>
                <h3>{sub.company_name}</h3>
                <p>
                  <strong>Overall status:</strong>{' '}
                  {compliance.compliant ? 'Compliant' : 'Noncompliant'}
                </p>
                <p>
                  <strong>Warning:</strong> {compliance.warning}
                </p>
                <p><strong>Trade:</strong> {sub.trade || '—'}</p>
                <p><strong>Contact:</strong> {sub.contact_name || '—'}</p>
                <p><strong>Sub email:</strong> {sub.subcontractor_email || '—'}</p>

                <hr style={{ margin: '12px 0' }} />

                <p>
                  <strong>General Liability:</strong>{' '}
                  {getDocStatusLabel(compliance.glDays)}
                </p>
                <p>
                  <strong>GL expiration:</strong>{' '}
                  {sub.gl_expiration_date || '—'}
                </p>
                <p>
                  <strong>GL agent email:</strong>{' '}
                  {sub.gl_agent_email || '—'}
                </p>

                <hr style={{ margin: '12px 0' }} />

                <p>
                  <strong>Workers&apos; Comp exempt:</strong>{' '}
                  {compliance.isExempt ? 'Yes' : 'No'}
                </p>

                {compliance.isExempt ? (
                  <>
                    <p>
                      <strong>ICEC:</strong> {getDocStatusLabel(compliance.icecDays)}
                    </p>
                    <p>
                      <strong>ICEC expiration:</strong>{' '}
                      {sub.icec_expiration_date || '—'}
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      <strong>Workers&apos; Comp:</strong>{' '}
                      {getDocStatusLabel(compliance.wcDays)}
                    </p>
                    <p>
                      <strong>WC expiration:</strong>{' '}
                      {sub.wc_expiration_date || '—'}
                    </p>
                    <p>
                      <strong>WC agent email:</strong>{' '}
                      {sub.wc_agent_email || '—'}
                    </p>
                  </>
                )}

                <p>
                  <strong>Last requested date:</strong>{' '}
                  {sub.last_requested_date || '—'}
                </p>
                <p>
                  <strong>Request status:</strong>{' '}
                  {sub.request_status || 'Not Requested'}
                </p>

                <p><strong>Notes:</strong> {sub.notes || '—'}</p>

                <div style={{ marginTop: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {(sub.subcontractor_email || sub.gl_agent_email || sub.wc_agent_email) && (
                    <>
                      <a
                        href={buildMailtoLink(sub)}
                        style={{
                          display: 'inline-block',
                          padding: '10px 14px',
                          border: '1px solid #333',
                          borderRadius: '8px',
                          textDecoration: 'none',
                          color: '#111',
                          backgroundColor: '#fff',
                        }}
                      >
                        Request Updated Insurance
                      </a>

                      <button type="button" onClick={() => markRequestSent(sub.id)}>
                        Mark Request Sent
                      </button>
                    </>
                  )}

                  <button type="button" onClick={() => startEdit(sub)}>
                    Edit
                  </button>

                  <button type="button" onClick={() => handleDelete(sub.id)}>
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