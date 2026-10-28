(() => {
  'use strict';

  /*
   * Modèle de données
   * programme > semaines > séances (nom) > exercices > séries (type, reps, kg)
   */
  const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const TYPES = { force: 'Force', hypertrophie: 'Hypertrophie', echauffement: 'Échauffement' };
  const LS_KEY = 'grimoire-de-fer';

  let db = { exercises: [], programs: [] };
  let mode = 'server'; // 'server' ou 'local' (si ouvert sans le serveur)
  let progId = null;
  let weekIdx = 0; // semaine affichée dans l'onglet Programme
  let suiviIdx = 0; // semaine affichée dans l'onglet Suivi
  let saveTimer = null;
  const IS_APP = !!window.Capacitor?.isNativePlatform?.();
  const LOCAL_WHERE = IS_APP ? 'sur ce téléphone' : 'dans ce navigateur';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const uid = (p) => p + Math.random().toString(36).slice(2, 9);
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
  const fmt = (n) => (n === null || n === undefined ? '-' : String(Math.round(n * 100) / 100).replace('.', ','));

  /* ---------- Couloir de voûtes d'ogives (SVG) ---------- */
  function buildVault() {
    const W = 1200, H = 300, cx = 600, vy = 185;
    const w = 1000, c = 0.56 * w, h = Math.sqrt(c * w - (w * w) / 4); // arc brisé
    const Y0 = -20 + h; // ligne de retombée de la grande arche
    const S = [1, 0.74, 0.55, 0.41, 0.31, 0.23, 0.17, 0.125];
    const P = (x, y, s) => [cx + s * (x - cx), vy + s * (y - vy)];
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

    const arches = S.map((s) => {
      const [x0, y0] = P(cx - w / 2, Y0, s);
      const [xa, ya] = P(cx, Y0 - h, s);
      const [x1] = P(cx + w / 2, Y0, s);
      return { s, x0, x1, y0, xa, ya, r: c * s };
    });

    let out = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#e4c677"/><stop offset="1" stop-color="#8a6f35"/>
        </linearGradient>
        <radialGradient id="candle" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="#ffe3a0" stop-opacity=".95"/>
          <stop offset=".3" stop-color="#ffab4d" stop-opacity=".5"/>
          <stop offset="1" stop-color="#ff7a30" stop-opacity="0"/>
        </radialGradient>
      </defs>`;

    // Arches, de la plus proche à la plus lointaine
    arches.forEach((a, i) => {
      const t = i / (S.length - 1);
      const [r, g, b] = mix([12, 4, 8], [96, 20, 34], t);
      out += `<path d="M${a.x0},${a.y0} A${a.r},${a.r} 0 0 1 ${a.xa},${a.ya} A${a.r},${a.r} 0 0 1 ${a.x1},${a.y0} Z"
        fill="rgb(${r},${g},${b})" stroke="url(#gold)" stroke-width="${(1 + 3.2 * a.s).toFixed(1)}" stroke-linejoin="round"/>`;
    });

    // Nervures diagonales (ogives) entre arches successives, formant des X
    for (let i = 0; i < arches.length - 1; i++) {
      const a = arches[i], b = arches[i + 1];
      const B = [cx, (a.ya + b.ya) / 2];
      const rib = (L, R) => {
        const k = 0.45;
        return `M${L[0]},${L[1]} C${L[0]},${B[1] + (L[1] - B[1]) * 0.3} ${B[0] - (B[0] - L[0]) * k},${B[1]} ${B[0]},${B[1]}
                C${B[0] + (R[0] - B[0]) * k},${B[1]} ${R[0]},${B[1] + (R[1] - B[1]) * 0.3} ${R[0]},${R[1]}`;
      };
      const sw = (0.8 + 2 * b.s).toFixed(1);
      out += `<path d="${rib([a.x0, a.y0], [b.x1, b.y0])}" fill="none" stroke="#c8a24d" stroke-opacity=".55" stroke-width="${sw}"/>`;
      out += `<path d="${rib([a.x1, a.y0], [b.x0, b.y0])}" fill="none" stroke="#c8a24d" stroke-opacity=".55" stroke-width="${sw}"/>`;
      out += `<circle cx="${B[0]}" cy="${B[1]}" r="${(2 + 5 * b.s).toFixed(1)}" fill="#c8a24d" stroke="#3a2a0c" stroke-width="1"/>`;
    }

    // Arête faîtière (clé de voûte)
    const first = arches[0], last = arches[arches.length - 1];
    out += `<path d="M${cx},${first.ya} L${cx},${last.ya}" stroke="#d8b862" stroke-opacity=".7" stroke-width="2.5"/>`;

    // Lueur de bougie au fond du couloir
    out += `<circle cx="${cx}" cy="${vy + 12}" r="95" fill="url(#candle)"/>
      <ellipse cx="${cx}" cy="${vy + 14}" rx="7" ry="13" fill="#fff0c2" opacity=".9"/></svg>`;
    $('#vault').innerHTML = out;
  }

  /* ---------- Persistance ---------- */
  function setStatus(msg) {
    $('#status').textContent = msg;
  }

  // Convertit l'ancien format (programme.entries) vers semaines > séances > exercices > séries
  function migrate() {
    let changed = false;
    db.exercises ||= [];
    db.programs ||= [];
    db.programs.forEach((p) => {
      (p.weeks || []).forEach((w) =>
        (w.sessions || []).forEach((s) => {
          const seen = new Map();
          const kept = [];
          s.exercises.forEach((e) => {
            const first = seen.get(e.exerciseId);
            if (first) {
              first.sets.push(...e.sets);
              changed = true;
            } else {
              seen.set(e.exerciseId, e);
              kept.push(e);
            }
          });
          s.exercises = kept;
        })
      );
      if (!Array.isArray(p.weeks)) {
        p.weeks = [];
        changed = true;
      }
      if (Array.isArray(p.entries)) {
        const byWeek = new Map();
        p.entries.forEach((x) => {
          if (!byWeek.has(x.week)) byWeek.set(x.week, []);
          byWeek.get(x.week).push(x);
        });
        [...byWeek.keys()]
          .sort((a, b) => a - b)
          .forEach((wn) => {
            const sessions = new Map();
            byWeek.get(wn).forEach((x) => {
              const day = x.day || '';
              if (!sessions.has(day)) sessions.set(day, { id: uid('se'), name: day || 'Séance', day, exercises: [] });
              const reps = x.reps || 1;
              const sets = Array.from({ length: Math.max(1, x.sets || 1) }, () => ({
                id: uid('st'),
                type: reps <= 5 ? 'force' : 'hypertrophie',
                reps,
                kg: x.kg || 0,
                doneReps: x.done ? reps : null,
                doneKg: x.done ? x.doneKg ?? x.kg ?? 0 : null,
                done: !!x.done,
              }));
              sessions.get(day).exercises.push({ id: uid('bl'), exerciseId: x.exerciseId, sets });
            });
            const list = [...sessions.values()].sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day));
            p.weeks.push({ id: uid('wk'), sessions: list });
          });
        delete p.entries;
        changed = true;
      }
    });
    return changed;
  }

  async function load() {
    try {
      const r = await fetch('/api/data', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      db = await r.json();
      mode = 'server';
      setStatus('Données gravées dans data.json');
    } catch {
      mode = 'local';
      try {
        db = JSON.parse(localStorage.getItem(LS_KEY)) || db;
      } catch {}
      setStatus(IS_APP ? 'Données enregistrées sur ce téléphone. Pensez à exporter une sauvegarde.' : 'Serveur absent : sauvegarde dans ce navigateur uniquement');
    }
    if (migrate()) save();
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (mode === 'server') {
        try {
          const r = await fetch('/api/data', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(db),
          });
          if (!r.ok) throw new Error();
          setStatus('Sauvegardé dans data.json');
        } catch {
          setStatus('Échec de la sauvegarde : le serveur répond-il ?');
        }
      } else {
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(db));
          setStatus('Sauvegardé ' + LOCAL_WHERE);
        } catch {
          setStatus('Échec de la sauvegarde locale');
        }
      }
    }, 250);
  }

  /* ---------- Helpers ---------- */
  const exo = (id) => db.exercises.find((e) => e.id === id);
  const prog = () => db.programs.find((p) => p.id === progId);
  const exoName = (id) => exo(id)?.name ?? '(exercice supprimé)';
  const newSet = (type, reps, kg) => ({ id: uid('st'), type, reps, kg, doneReps: null, doneKg: null, done: false });
  const typeOptions = (sel) =>
    Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
  const exoOptions = () =>
    db.exercises
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .map((e) => `<option value="${e.id}">${esc(e.name)}</option>`)
      .join('');

  function findSet(id, week) {
    for (const s of week?.sessions ?? []) for (const e of s.exercises) for (const t of e.sets) if (t.id === id) return t;
    return null;
  }

  /* ---------- Onglets ---------- */
  $$('.tab').forEach((b) =>
    b.addEventListener('click', () => {
      $$('.tab').forEach((t) => t.classList.toggle('active', t === b));
      $$('.panel').forEach((p) => p.classList.toggle('active', p.id === b.dataset.tab));
      renderAll();
    })
  );

  /* ---------- Bestiaire ---------- */
  // Couleur de vitrail stable selon le muscle ciblé
  const GLASS = ['#8a0f26', '#5a1a4a', '#7a4a10', '#1d4b46', '#3a2a6a', '#6b1f10'];
  function glass(s) {
    let h = 0;
    for (const c of String(s).toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return GLASS[h % GLASS.length];
  }

  const exoForm = $('#exo-form');

  exoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(exoForm);
    const data = {
      name: f.get('name').trim(),
      muscle: f.get('muscle').trim(),
      equipment: f.get('equipment').trim(),
      notes: f.get('notes').trim(),
    };
    if (!data.name) return;
    const id = f.get('id');
    if (id) Object.assign(exo(id), data);
    else db.exercises.push({ id: uid('ex'), ...data });
    resetExoForm();
    save();
    renderAll();
  });

  function resetExoForm() {
    exoForm.reset();
    exoForm.elements.id.value = '';
    $('#exo-cancel').hidden = true;
    exoForm.querySelector('.primary').textContent = "Invoquer l'exercice";
  }
  $('#exo-cancel').addEventListener('click', resetExoForm);
  $('#exo-search').addEventListener('input', renderExos);

  function renderExos() {
    const q = $('#exo-search').value.trim().toLowerCase();
    const list = db.exercises
      .filter((e) => [e.name, e.muscle, e.equipment].join(' ').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    $('#exo-list').innerHTML = list.length
      ? list
          .map(
            (e) => `
      <article class="exo" style="--glass:${glass(e.muscle || e.name)}">
        <h4>${esc(e.name)}</h4>
        ${e.muscle ? `<span class="tag">${esc(e.muscle)}</span>` : ''}
        ${e.equipment ? `<span class="tag">${esc(e.equipment)}</span>` : ''}
        ${e.notes ? `<p>${esc(e.notes)}</p>` : ''}
        <div class="actions">
          <button class="btn small" data-edit="${e.id}">Modifier</button>
          <button class="btn small danger" data-del="${e.id}">Supprimer</button>
        </div>
      </article>`
          )
          .join('')
      : '<p class="empty">Le bestiaire est vide... invoquez votre premier exercice.</p>';
  }

  $('#exo-list').addEventListener('click', (ev) => {
    const edit = ev.target.closest('[data-edit]');
    const del = ev.target.closest('[data-del]');
    if (edit) {
      const e = exo(edit.dataset.edit);
      for (const k of ['id', 'name', 'muscle', 'equipment', 'notes']) exoForm.elements[k].value = e[k] ?? '';
      $('#exo-cancel').hidden = false;
      exoForm.querySelector('.primary').textContent = 'Enregistrer';
      exoForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (del) {
      const id = del.dataset.del;
      let used = 0;
      db.programs.forEach((p) => p.weeks.forEach((w) => w.sessions.forEach((s) => (used += s.exercises.filter((x) => x.exerciseId === id).length))));
      const msg = used
        ? `Cet exercice est utilisé ${used} fois dans vos programmes. Le supprimer le retirera aussi de ces séances. Continuer ?`
        : 'Supprimer cet exercice ?';
      if (!confirm(msg)) return;
      db.exercises = db.exercises.filter((e) => e.id !== id);
      db.programs.forEach((p) => p.weeks.forEach((w) => w.sessions.forEach((s) => (s.exercises = s.exercises.filter((x) => x.exerciseId !== id)))));
      save();
      renderAll();
    }
  });

  /* ---------- Programme : choix du programme ---------- */
  function renderProgSelect() {
    const sel = $('#prog-select');
    if (!db.programs.find((p) => p.id === progId)) progId = db.programs[0]?.id ?? null;
    sel.innerHTML = db.programs.length
      ? db.programs.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')
      : '<option value="">Aucun programme</option>';
    sel.value = progId ?? '';
  }

  $('#prog-select').addEventListener('change', (e) => {
    progId = e.target.value;
    weekIdx = 0;
    suiviIdx = 0;
    renderAll();
  });

  $('#prog-new').addEventListener('click', () => {
    const name = prompt('Nom du nouveau programme :');
    if (!name || !name.trim()) return;
    const p = { id: uid('pr'), name: name.trim(), weeks: [{ id: uid('wk'), sessions: [] }] };
    db.programs.push(p);
    progId = p.id;
    weekIdx = 0;
    suiviIdx = 0;
    save();
    renderAll();
  });

  $('#prog-rename').addEventListener('click', () => {
    const p = prog();
    if (!p) return;
    const name = prompt('Nouveau nom :', p.name);
    if (!name || !name.trim()) return;
    p.name = name.trim();
    save();
    renderAll();
  });

  $('#prog-delete').addEventListener('click', () => {
    const p = prog();
    if (!p || !confirm(`Supprimer le programme « ${p.name} » et tout son historique ?`)) return;
    db.programs = db.programs.filter((x) => x.id !== p.id);
    progId = null;
    weekIdx = 0;
    suiviIdx = 0;
    save();
    renderAll();
  });

  /* ---------- Programme : semaines ---------- */
  function renderWeekBar() {
    const p = prog();
    const bar = $('#week-bar');
    if (!p) return (bar.innerHTML = '');
    if (weekIdx >= p.weeks.length) weekIdx = Math.max(0, p.weeks.length - 1);
    bar.innerHTML =
      p.weeks.map((w, i) => `<button class="wk ${i === weekIdx ? 'active' : ''}" data-wk="${i}">Semaine ${i + 1}</button>`).join('') +
      `<span class="wk-tools">
        <button class="btn small" data-wact="add">+ Semaine vide</button>
        <button class="btn small" data-wact="dup" ${p.weeks.length ? '' : 'disabled'}>Dupliquer cette semaine</button>
        <button class="btn small danger" data-wact="del" ${p.weeks.length ? '' : 'disabled'}>Supprimer</button>
      </span>`;
  }

  function cloneWeek(w, inc) {
    return {
      id: uid('wk'),
      sessions: w.sessions.map((s) => ({
        ...s,
        id: uid('se'),
        exercises: s.exercises.map((e) => ({
          ...e,
          id: uid('bl'),
          sets: e.sets.map((t) => ({
            id: uid('st'),
            type: t.type,
            reps: t.reps,
            kg: t.type === 'echauffement' ? t.kg : Math.max(0, t.kg + inc),
            doneReps: null,
            doneKg: null,
            done: false,
          })),
        })),
      })),
    };
  }

  $('#week-bar').addEventListener('click', (ev) => {
    const p = prog();
    if (!p) return;
    const wk = ev.target.closest('[data-wk]');
    const act = ev.target.closest('[data-wact]')?.dataset.wact;
    if (wk) {
      weekIdx = Number(wk.dataset.wk);
      renderWeekBar();
      renderProg();
      return;
    }
    if (act === 'add') {
      p.weeks.push({ id: uid('wk'), sessions: [] });
      weekIdx = p.weeks.length - 1;
    }
    if (act === 'dup') {
      const inc = num(prompt('Augmenter les charges de combien de kg pour la nouvelle semaine ?\n(0 pour garder les mêmes ; les échauffements ne changent pas)', '2.5'));
      if (inc === null) return;
      p.weeks.push(cloneWeek(p.weeks[weekIdx], inc));
      weekIdx = p.weeks.length - 1;
    }
    if (act === 'del') {
      if (!confirm(`Supprimer la semaine ${weekIdx + 1} avec toutes ses séances ?`)) return;
      p.weeks.splice(weekIdx, 1);
      weekIdx = Math.max(0, weekIdx - 1);
      suiviIdx = Math.min(suiviIdx, Math.max(0, p.weeks.length - 1));
    }
    if (!act) return;
    save();
    renderAll();
  });

  /* ---------- Programme : séances ---------- */
  const sessionForm = $('#session-form');

  sessionForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const p = prog();
    const w = p?.weeks[weekIdx];
    if (!w) return;
    const f = new FormData(sessionForm);
    const name = f.get('name').trim();
    if (!name) return;
    w.sessions.push({ id: uid('se'), name, day: f.get('day') || '', exercises: [] });
    sessionForm.reset();
    save();
    renderProg();
  });

  function exoBlockHtml(e) {
    const last = e.sets[e.sets.length - 1];
    return `
      <div class="exo-block" data-e="${e.id}">
        <div class="e-head">
          <h4>${esc(exoName(e.exerciseId))}</h4>
          <div class="actions">
            <button class="btn small" data-act="e-up" title="Monter">&#9650;</button>
            <button class="btn small" data-act="e-down" title="Descendre">&#9660;</button>
            <button class="btn small danger" data-act="e-del">Retirer</button>
          </div>
        </div>
        ${
          e.sets.length
            ? `<div class="table-wrap"><table class="prog-table">
          <thead><tr><th>Série</th><th>Type</th><th>Reps</th><th>Charge</th><th></th></tr></thead>
          <tbody>${e.sets
            .map(
              (t, i) => `
            <tr data-set="${t.id}">
              <td class="num">${i + 1}</td>
              <td><select data-f="type" data-type="${t.type}">${typeOptions(t.type)}</select></td>
              <td><span class="unit"><input type="number" min="1" value="${t.reps}" data-f="reps"><em>reps</em></span></td>
              <td><span class="unit"><input type="number" min="0" step="0.5" value="${t.kg}" data-f="kg"><em>kg</em></span></td>
              <td><button class="btn small danger" data-act="set-del" title="Retirer la série">&times;</button></td>
            </tr>`
            )
            .join('')}</tbody>
        </table></div>`
            : '<p class="empty compact">Aucune série : ajoutez la première ci-dessous.</p>'
        }
        <form class="add-set">
          <label>Type
            <select name="type">${typeOptions(last?.type ?? 'force')}</select>
          </label>
          <label>Reps
            <input name="reps" type="number" min="1" value="${last?.reps ?? 5}" required>
          </label>
          <label>Kg
            <input name="kg" type="number" min="0" step="0.5" value="${last?.kg ?? 0}" required>
          </label>
          <button class="btn small primary" type="submit">+ Ajouter la série</button>
        </form>
      </div>`;
  }

  function sessionHtml(s) {
    return `
      <article class="card session" data-s="${s.id}">
        <header class="s-head">
          <h3>${esc(s.name)}</h3>
          ${s.day ? `<span class="tag">${esc(s.day)}</span>` : ''}
          <div class="actions">
            <button class="btn small" data-act="s-rename">Renommer</button>
            <button class="btn small danger" data-act="s-del">Supprimer</button>
          </div>
        </header>
        ${s.exercises.length ? s.exercises.map(exoBlockHtml).join('') : '<p class="empty compact">Aucun exercice dans cette séance.</p>'}
        <form class="add-exo" data-s="${s.id}">
          <label class="grow">Ajouter un exercice à cette séance
            <select name="exerciseId" required>${exoOptions()}</select>
          </label>
          <button class="btn primary" type="submit">Ajouter l'exercice</button>
        </form>
      </article>`;
  }

  function renderProg() {
    const p = prog();
    const view = $('#prog-view');
    sessionForm.hidden = !p || !p.weeks.length;
    if (!p) return (view.innerHTML = '<p class="empty">Créez un programme pour commencer.</p>');
    if (!p.weeks.length) return (view.innerHTML = '<p class="empty">Ajoutez une première semaine.</p>');
    const w = p.weeks[weekIdx];
    view.innerHTML = w.sessions.length
      ? w.sessions.map(sessionHtml).join('')
      : "<p class=\"empty\">Cette semaine n'a pas encore de séance. Donnez un nom à la première ci-dessus.</p>";
  }

  $('#prog-view').addEventListener('submit', (ev) => {
    const addExo = ev.target.closest('form.add-exo');
    const addSet = ev.target.closest('form.add-set');
    if (!addExo && !addSet) return;
    ev.preventDefault();
    const week = prog().weeks[weekIdx];

    if (addExo) {
      const s = week.sessions.find((x) => x.id === addExo.dataset.s);
      const exerciseId = new FormData(addExo).get('exerciseId');
      if (!exerciseId) return alert("Ajoutez d'abord des exercices au bestiaire.");
      const existing = s.exercises.find((x) => x.exerciseId === exerciseId);
      if (existing) {
        // Pas de second bloc : on renvoie vers l'exercice déjà présent
        const el = addExo.closest('.session').querySelector(`[data-e="${existing.id}"]`);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 1200);
        return;
      }
      s.exercises.push({ id: uid('bl'), exerciseId, sets: [] });
    } else {
      const s = week.sessions.find((x) => x.id === addSet.closest('[data-s]').dataset.s);
      const e = s.exercises.find((x) => x.id === addSet.closest('[data-e]').dataset.e);
      const d = new FormData(addSet);
      e.sets.push(newSet(d.get('type'), Math.max(1, Number(d.get('reps')) || 1), Math.max(0, Number(d.get('kg')) || 0)));
      save();
      renderProg();
      // Remet le curseur sur le champ Reps de l'exercice pour enchaîner
      document.querySelector(`#prog-view [data-e="${e.id}"] .add-set [name=reps]`)?.focus();
      return;
    }
    save();
    renderProg();
  });

  $('#prog-view').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const w = prog().weeks[weekIdx];
    const s = w.sessions.find((x) => x.id === b.closest('[data-s]')?.dataset.s);
    if (!s) return;
    const e = s.exercises.find((x) => x.id === b.closest('[data-e]')?.dataset.e);
    const setId = b.closest('[data-set]')?.dataset.set;

    switch (b.dataset.act) {
      case 's-rename': {
        const name = prompt('Nom de la séance :', s.name);
        if (!name || !name.trim()) return;
        s.name = name.trim();
        break;
      }
      case 's-del':
        if (!confirm(`Supprimer la séance « ${s.name} » ?`)) return;
        w.sessions = w.sessions.filter((x) => x !== s);
        break;
      case 'e-del':
        s.exercises = s.exercises.filter((x) => x !== e);
        break;
      case 'e-up':
      case 'e-down': {
        const i = s.exercises.indexOf(e);
        const j = b.dataset.act === 'e-up' ? i - 1 : i + 1;
        if (j < 0 || j >= s.exercises.length) return;
        [s.exercises[i], s.exercises[j]] = [s.exercises[j], s.exercises[i]];
        break;
      }
      case 'set-del':
        e.sets = e.sets.filter((t) => t.id !== setId);
        break;
      default:
        return;
    }
    save();
    renderProg();
  });

  $('#prog-view').addEventListener('change', (ev) => {
    const inp = ev.target.closest('[data-f]');
    const tr = inp?.closest('[data-set]');
    if (!tr) return;
    const set = findSet(tr.dataset.set, prog().weeks[weekIdx]);
    if (!set) return;
    if (inp.dataset.f === 'type') {
      set.type = inp.value;
      inp.dataset.type = inp.value;
    } else {
      const v = num(inp.value);
      if (v === null) return;
      set[inp.dataset.f] = v;
    }
    save();
  });

  /* ---------- Suivi ---------- */
  const sessionCounts = (s) => {
    const sets = s.exercises.flatMap((e) => e.sets);
    return { done: sets.filter((t) => t.done).length, total: sets.length };
  };

  function renderSuivi() {
    const p = prog();
    const sel = $('#suivi-week');
    const view = $('#suivi-view');
    if (!p || !p.weeks.length) {
      sel.innerHTML = '';
      view.innerHTML = '<p class="empty">Aucun programme à suivre pour le moment.</p>';
      $('#stats').innerHTML = '';
      return;
    }
    if (suiviIdx >= p.weeks.length) suiviIdx = p.weeks.length - 1;
    sel.innerHTML = p.weeks.map((w, i) => `<option value="${i}">Semaine ${i + 1}</option>`).join('');
    sel.value = suiviIdx;
    drawSuiviWeek();
    renderStats();
  }

  function drawSuiviWeek() {
    const w = prog().weeks[suiviIdx];
    $('#suivi-view').innerHTML = w.sessions.length
      ? w.sessions
          .map((s) => {
            const c = sessionCounts(s);
            return `
          <article class="card session" data-s="${s.id}">
            <header class="s-head">
              <h3>${esc(s.name)}</h3>
              ${s.day ? `<span class="tag">${esc(s.day)}</span>` : ''}
              <span class="s-progress">${c.done}/${c.total} séries</span>
            </header>
            ${
              s.exercises.length
                ? s.exercises
                    .map(
                      (e) => `
              <div class="exo-block">
                <div class="e-head"><h4>${esc(exoName(e.exerciseId))}</h4></div>
                <div class="table-wrap"><table class="suivi-table">
                  <thead><tr><th>Série</th><th>Type</th><th>Objectif</th><th>Reps faites</th><th>Kg faits</th><th>Fait</th></tr></thead>
                  <tbody>${e.sets
                    .map(
                      (t, i) => `
                    <tr data-set="${t.id}" class="${t.done ? 'done' : ''}">
                      <td class="num">${i + 1}</td>
                      <td><span class="tag t-${t.type}">${TYPES[t.type] ?? t.type}</span></td>
                      <td class="num">${t.reps} &times; ${fmt(t.kg)} kg</td>
                      <td><span class="unit"><input type="number" min="0" placeholder="${t.reps}" value="${t.doneReps ?? ''}" data-dreps><em>reps</em></span></td>
                      <td><span class="unit"><input type="number" min="0" step="0.5" placeholder="${t.kg}" value="${t.doneKg ?? ''}" data-dkg><em>kg</em></span></td>
                      <td><input type="checkbox" ${t.done ? 'checked' : ''} data-done></td>
                    </tr>`
                    )
                    .join('')}</tbody>
                </table></div>
              </div>`
                    )
                    .join('')
                : '<p class="empty compact">Aucun exercice dans cette séance.</p>'
            }
          </article>`;
          })
          .join('')
      : "<p class=\"empty\">Cette semaine n'a pas de séance.</p>";
  }

  $('#suivi-week').addEventListener('change', (e) => {
    suiviIdx = Number(e.target.value);
    drawSuiviWeek();
  });

  $('#suivi-view').addEventListener('change', (ev) => {
    const tr = ev.target.closest('[data-set]');
    if (!tr) return;
    const week = prog().weeks[suiviIdx];
    const set = findSet(tr.dataset.set, week);
    if (!set) return;
    const el = ev.target;

    if (el.matches('[data-done]')) {
      set.done = el.checked;
    } else if (el.matches('[data-dreps]')) {
      set.doneReps = num(el.value);
      if (set.doneReps !== null) set.done = true;
    } else if (el.matches('[data-dkg]')) {
      set.doneKg = num(el.value);
      if (set.doneKg !== null) set.done = true;
    }
    if (set.done) {
      if (set.doneReps === null) set.doneReps = set.reps;
      if (set.doneKg === null) set.doneKg = set.kg;
    }

    // Mise à jour de la ligne sans tout redessiner (garde le focus)
    tr.classList.toggle('done', set.done);
    tr.querySelector('[data-done]').checked = set.done;
    tr.querySelector('[data-dreps]').value = set.doneReps ?? '';
    tr.querySelector('[data-dkg]').value = set.doneKg ?? '';
    const sEl = tr.closest('[data-s]');
    const s = week.sessions.find((x) => x.id === sEl.dataset.s);
    const c = sessionCounts(s);
    sEl.querySelector('.s-progress').textContent = `${c.done}/${c.total} séries`;

    save();
    renderStats();
  });

  function renderStats() {
    const p = prog();
    // exerciseId -> semaine -> { max kg, volume } (séries de travail validées, hors échauffement)
    const by = new Map();
    p.weeks.forEach((w, wi) =>
      w.sessions.forEach((s) =>
        s.exercises.forEach((e) =>
          e.sets.forEach((t) => {
            if (!t.done || t.type === 'echauffement') return;
            const kg = t.doneKg ?? t.kg;
            const reps = t.doneReps ?? t.reps;
            if (!by.has(e.exerciseId)) by.set(e.exerciseId, new Map());
            const m = by.get(e.exerciseId);
            const cur = m.get(wi) ?? { kg: 0, vol: 0 };
            cur.kg = Math.max(cur.kg, kg);
            cur.vol += kg * reps;
            m.set(wi, cur);
          })
        )
      )
    );
    if (!by.size) {
      $('#stats').innerHTML = '<p class="empty">Validez des séries de travail pour voir votre progression.</p>';
      return;
    }
    const globalMax = Math.max(...[...by.values()].flatMap((m) => [...m.values()].map((r) => r.kg)), 1);
    $('#stats').innerHTML = [...by.entries()]
      .map(([id, m]) => {
        const series = [...m.entries()].sort((a, b) => a[0] - b[0]);
        const best = Math.max(...series.map(([, r]) => r.kg));
        const diff = best - series[0][1].kg;
        const vol = series.reduce((n, [, r]) => n + r.vol, 0);
        return `
        <div class="stat card">
          <div class="name"><span>${esc(exoName(id))}</span>
            <span>Record : ${fmt(best)} kg${series.length > 1 ? ` (${diff >= 0 ? '+' : ''}${fmt(diff)} kg depuis la semaine ${series[0][0] + 1})` : ''} &middot; Volume : ${fmt(vol)} kg</span></div>
          <div class="bar"><i style="width:${(best / globalMax) * 100}%"></i></div>
          <div class="spark" title="Charge max par semaine">${series
            .map(([wi, r]) => `<b style="height:${Math.max(8, (r.kg / best) * 100)}%" title="Semaine ${wi + 1} : ${fmt(r.kg)} kg"></b>`)
            .join('')}</div>
        </div>`;
      })
      .join('');
  }

  /* ---------- Export / Import ---------- */
  $('#export').addEventListener('click', async () => {
    const json = JSON.stringify(db, null, 2);
    const name = `grimoire-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    const plugins = window.Capacitor?.Plugins;
    if (IS_APP && plugins?.Filesystem && plugins?.Share) {
      try {
        const res = await plugins.Filesystem.writeFile({ path: name, data: json, directory: 'CACHE', encoding: 'utf8' });
        await plugins.Share.share({ title: 'Sauvegarde Grimoire de Fer', url: res.uri, dialogTitle: 'Enregistrer la sauvegarde' });
        return;
      } catch (e) {
        if (/cancel/i.test(String(e?.message ?? e))) return;
        alert("Export impossible : " + (e?.message ?? e));
        return;
      }
    }
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#import').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.exercises) || !Array.isArray(data.programs)) throw new Error();
      if (!confirm('Remplacer toutes les données actuelles par ce fichier ?')) return;
      db = data;
      migrate();
      progId = null;
      weekIdx = 0;
      suiviIdx = 0;
      save();
      renderAll();
    } catch {
      alert('Fichier invalide.');
    }
    ev.target.value = '';
  });

  /* ---------- Rendu global ---------- */
  function renderAll() {
    renderExos();
    renderProgSelect();
    renderWeekBar();
    renderProg();
    renderSuivi();
  }

  buildVault();
  load().then(renderAll);
})();
