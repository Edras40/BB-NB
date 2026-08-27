/* =====================================================================
   PANTALLA DE TV — estadísticas en vivo
   Carga los votos existentes y luego se suscribe a Supabase Realtime:
   cada vez que un celular guarda un voto nuevo, esta pantalla se
   actualiza sola, sin recargar la página.
   ===================================================================== */

function $(id) { return document.getElementById(id); }

let pieChart = null;
let barChart = null;
let allVotes = [];

async function fetchAllVotes() {
  const { data, error } = await sb
    .from('votes')
    .select('name, vote, familiar, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('No se pudieron cargar los votos:', error);
    return [];
  }
  return data.map((v) => ({ name: v.name, vote: v.vote, timestamp: v.created_at }));
}

function renderAll() {
  const total = allVotes.length;
  const ninaCount = allVotes.filter((v) => v.vote === 'nina').length;
  const ninoCount = allVotes.filter((v) => v.vote === 'nino').length;
  const ninaPct = total ? Math.round((ninaCount / total) * 100) : 0;
  const ninoPct = total ? Math.round((ninoCount / total) * 100) : 0;

  $('tvTotal').textContent = total;
  $('tvNinaCount').textContent = ninaCount;
  $('tvNinoCount').textContent = ninoCount;
  $('tvNinaPercent').textContent = `${ninaPct}%`;
  $('tvNinoPercent').textContent = `${ninoPct}%`;

  renderPie(ninaCount, ninoCount);
  renderBar(ninaCount, ninoCount);
  renderTimeline(allVotes);
}

function renderPie(ninaCount, ninoCount) {
  const ctx = $('tvPieChart').getContext('2d');
  const data = {
    labels: ['Niña', 'Niño'],
    datasets: [{
      data: [ninaCount, ninoCount],
      backgroundColor: ['#F2A6CE', '#9CD4F2'],
      borderColor: '#ffffff',
      borderWidth: 3,
    }],
  };
  if (pieChart) {
    pieChart.data = data;
    pieChart.update();
  } else {
    pieChart = new Chart(ctx, {
      type: 'pie',
      data,
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom', labels: { font: { family: 'Quicksand', size: 20 }, color: '#4A3F4E' } },
        },
      },
    });
  }
}

function renderBar(ninaCount, ninoCount) {
  const ctx = $('tvBarChart').getContext('2d');
  const data = {
    labels: ['Niña', 'Niño'],
    datasets: [{
      label: 'Votos',
      data: [ninaCount, ninoCount],
      backgroundColor: ['#F2A6CE', '#9CD4F2'],
      borderRadius: 12,
    }],
  };
  if (barChart) {
    barChart.data = data;
    barChart.update();
  } else {
    barChart = new Chart(ctx, {
      type: 'bar',
      data,
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0, font: { size: 16 } } },
          x: { ticks: { font: { family: 'Baloo 2', size: 20 } } },
        },
      },
    });
  }
}

function renderTimeline(votes) {
  const list = $('tvTimelineList');
  list.innerHTML = '';
  if (!votes.length) {
    list.innerHTML = '<li class="timeline-empty">Esperando el primer voto…</li>';
    return;
  }
  // Más reciente primero, mostramos hasta 12 para que quepan en pantalla.
  const sorted = [...votes].reverse().slice(0, 12);
  sorted.forEach((v) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${escapeHtml(v.name)}</span>
      <span class="timeline-badge ${v.vote}">${v.vote === 'nina' ? 'Niña' : 'Niño'}</span>
    `;
    list.appendChild(li);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function init() {
  allVotes = await fetchAllVotes();
  renderAll();

  // Suscripción en tiempo real: cada INSERT nuevo en "votes" llega aquí solo.
  sb.channel('votes-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, (payload) => {
      const v = payload.new;
      allVotes.push({ name: v.name, vote: v.vote, timestamp: v.created_at });
      renderAll();
    })
    .subscribe();
}

init();
