// Claims Tracking Panel — Rs 15K penalty tracking
const AdminClaims = (() => {
  const panel = document.getElementById('claimsPanel');
  const claimsTable = document.getElementById('claimsTable');
  const claimStats = document.getElementById('claimStats');

  async function load() {
    if (!panel) return;

    try {
      // Get all claims
      const { data: claims, error } = await supabase
        .from('claims')
        .select('*')
        .order('claim_date', { ascending: false });

      if (error) throw error;

      if (!claims || claims.length === 0) {
        claimsTable.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#666">No claims yet</td></tr>';
        return;
      }

      // Calculate stats
      const stats = {
        open: claims.filter(c => c.status === 'open').length,
        claimed: claims.filter(c => c.status === 'claimed').length,
        paid: claims.filter(c => c.status === 'paid_to_charity').length,
        total: claims.length,
        totalAmount: claims.length * 15000
      };

      // Display stats
      if (claimStats) {
        claimStats.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px">
            <div style="background:#1a1d2e;padding:16px;border-radius:8px;border:1px solid rgba(0,212,255,0.1)">
              <div style="font-size:10px;color:#888">TOTAL CLAIMS</div>
              <div style="font-size:24px;color:#fff;margin-top:8px">${stats.total}</div>
            </div>
            <div style="background:#1a1d2e;padding:16px;border-radius:8px;border:1px solid rgba(0,212,255,0.1)">
              <div style="font-size:10px;color:#888">OPEN</div>
              <div style="font-size:24px;color:#00D4FF;margin-top:8px">${stats.open}</div>
            </div>
            <div style="background:#1a1d2e;padding:16px;border-radius:8px;border:1px solid rgba(245,166,35,0.1)">
              <div style="font-size:10px;color:#888">CLAIMED</div>
              <div style="font-size:24px;color:#F5A623;margin-top:8px">${stats.claimed}</div>
            </div>
            <div style="background:#1a1d2e;padding:16px;border-radius:8px;border:1px solid rgba(0,230,118,0.1)">
              <div style="font-size:10px;color:#888">PAID</div>
              <div style="font-size:24px;color:#00E676;margin-top:8px">${stats.paid}</div>
            </div>
            <div style="background:#1a1d2e;padding:16px;border-radius:8px;border:1px solid rgba(255,82,82,0.1)">
              <div style="font-size:10px;color:#888">TOTAL AMOUNT</div>
              <div style="font-size:20px;color:#FF5252;margin-top:8px">₹${stats.totalAmount.toLocaleString()}</div>
            </div>
          </div>
        `;
      }

      // Render claims table
      claimsTable.innerHTML = claims.map(claim => `
        <tr>
          <td style="font-family:var(--font-mono);font-size:11px">${claim.claim_date}</td>
          <td style="font-weight:600;color:#00D4FF">₹${claim.amount.toLocaleString()}</td>
          <td style="font-family:var(--font-mono);font-size:11px">
            <span style="padding:4px 8px;border-radius:4px;
              ${claim.status === 'open' ? 'background:#FF5252;color:#fff' :
                claim.status === 'claimed' ? 'background:#F5A623;color:#000' :
                'background:#00E676;color:#000'}">
              ${claim.status.toUpperCase()}
            </span>
          </td>
          <td style="font-size:11px;color:#888">${claim.claimed_by || '—'}</td>
          <td style="font-size:11px;color:#888">${claim.charity_name || '—'}</td>
          <td style="font-size:11px">
            ${claim.status === 'open' ? `
              <button onclick="AdminClaims.markClaimed(${claim.id})" style="padding:4px 8px;background:#F5A623;border:0;border-radius:4px;cursor:pointer;font-size:9px;color:#000;font-weight:600">CLAIMED</button>
              <button onclick="AdminClaims.markPaid(${claim.id})" style="padding:4px 8px;background:#00E676;border:0;border-radius:4px;cursor:pointer;font-size:9px;color:#000;font-weight:600;margin-left:4px">PAID</button>
            ` : '—'}
          </td>
        </tr>
      `).join('');

    } catch (e) {
      console.error('Claims load error:', e);
      claimsTable.innerHTML = `<tr><td colspan="6" style="color:#FF5252">Error: ${e.message}</td></tr>`;
    }
  }

  async function markClaimed(claimId) {
    const claimer = prompt('Who claimed this? (name/handle)');
    if (!claimer) return;

    const { error } = await supabase
      .from('claims')
      .update({
        status: 'claimed',
        claimed_by: claimer,
        claimed_at: new Date().toISOString()
      })
      .eq('id', claimId);

    if (error) alert('Error: ' + error.message);
    else load();
  }

  async function markPaid(claimId) {
    const charity = prompt('Charity name (or leave blank for manual payment):');
    if (charity === null) return;

    const { error } = await supabase
      .from('claims')
      .update({
        status: 'paid_to_charity',
        charity_name: charity || 'manual_payment',
        paid_at: new Date().toISOString()
      })
      .eq('id', claimId);

    if (error) alert('Error: ' + error.message);
    else load();
  }

  return { load, markClaimed, markPaid };
})();

// Auto-load on page load
document.addEventListener('DOMContentLoaded', () => AdminClaims.load());
