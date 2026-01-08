// contests.js - simple list rendering aligned with popup theme

const API_BASE = 'https://cp-list.vercel.app/api';
const ENDPOINT = API_BASE + '/contests/upcoming';

let contests = [];
let currentFilter = 'All';

document.addEventListener('DOMContentLoaded', () => {
  // Wire navigation buttons
  const openHome = document.getElementById('openHome');
  if (openHome) {
    openHome.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
    });
  }

  const refreshBtn = document.getElementById('refreshContests');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshBtn.classList.add('spinning');
      fetchAndRender().finally(() => refreshBtn.classList.remove('spinning'));
    });
  }

  // Filters
  document.querySelectorAll('.platform-switch').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.platform-switch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const key = btn.getAttribute('data-filter');
      currentFilter = key || 'All';
      renderList();
    });
  });

  // Initial load
  const defaultBtn = document.querySelector('.platform-switch[data-filter="All"]');
  if (defaultBtn) defaultBtn.classList.add('active');
  fetchAndRender();
});

async function fetchAndRender() {
  setStatus('Refreshing contests...');
  try {
    const resp = await fetch(ENDPOINT);
    const data = await resp.json();
    contests = (data && data.upcoming_contests) || [];
    setStatus('');
    renderList();
  } catch (e) {
    console.error('Failed to fetch contests', e);
    setStatus('Unable to refresh contests. Please check your internet connection.');
    renderList();
  }
}

function setStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text || '';
}

function renderList() {
  const container = document.getElementById('contestList');
  container.innerHTML = '';

  const filtered = filterContests(contests, currentFilter);
  if (!filtered.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No contests found for this filter.';
    container.appendChild(p);
    return;
  }

  filtered.forEach(c => {
    const card = document.createElement('a');
    card.href = c.url;
    card.target = '_blank';
    card.className = 'contest-card';

    const status = computeStatus(c);

    const title = document.createElement('div');
    title.className = 'contest-title';
    title.textContent = `${c.site} - ${c.title}`;

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.gap = '8px';

    const when = document.createElement('div');
    when.className = 'contest-meta';
    const sd = new Date(c.startTime);
    const ed = new Date(c.endTime);
    when.textContent = `Starts: ${fmtDate(sd)} • Ends: ${fmtDate(ed)} • Dur: ${c.duration}m`;

    const chip = document.createElement('span');
    chip.className = 'status-chip ' + (status === 'Ongoing' ? 'status-ongoing' : (status === 'Ended' ? 'status-ended' : 'status-upcoming'));
    chip.textContent = status === 'Upcoming' ? remainingText(c.startTime) : status;

    row.appendChild(when);
    row.appendChild(chip);

    card.appendChild(title);
    card.appendChild(row);

    container.appendChild(card);
  });
}

function filterContests(list, filterKey) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  if (filterKey === 'Ongoing') {
    return list.filter(c => c.startTime <= now && c.endTime >= now);
  } else if (filterKey === 'In24') {
    return list.filter(c => c.startTime > now && c.startTime <= now + day);
  } else if (filterKey === 'In7') {
    return list.filter(c => c.startTime > now && c.startTime <= now + 7 * day);
  }
  return list;
}

function computeStatus(c) {
  const now = Date.now();
  if (now > c.endTime) return 'Ended';
  if (now >= c.startTime && now <= c.endTime) return 'Ongoing';
  return 'Upcoming';
}

function remainingText(startMs) {
  const diff = Math.max(0, startMs - Date.now());
  const sec = Math.floor(diff / 1000);
  const days = Math.floor(sec / (60 * 60 * 24));
  const hours = Math.floor((sec / (60 * 60)) % 24);
  const mins = Math.floor((sec / 60) % 60);
  if (days >= 1) return `Starts in ${days}d ${hours}h`;
  if (hours >= 1) return `Starts in ${hours}h ${mins}m`;
  return `Starts in ${mins}m`;
}

function fmtDate(d) {
  try {
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return new Date(d).toISOString();
  }
}
