// Booking: barber -> calendar day -> time slot -> WhatsApp message to the shop.
// Static site: there is no server, so slots come from the opening hours and
// the booking is confirmed when the shop replies on WhatsApp.
(() => {
    const form = document.getElementById('booking');
    if (!form) return;

    const WHATSAPP = '60123456789'; // 012-345 6789 in international format
    const BOOKING_DAYS_AHEAD = 60;
    const TIMEZONE = 'Asia/Kuala_Lumpur';
    // Opening hours by JS weekday (0 = Ahad … 6 = Sabtu): [open, close] in whole hours; null = tutup.
    // Keep in sync with the hours table in index.html.
    const SCHEDULE = [[11, 16], null, [10, 20], [10, 20], [10, 20], [10, 20], [9, 18]];

    const BULAN = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
    const HARI_PENDEK = ['Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab', 'Aha'];
    const HARI = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];

    const grid = form.querySelector('.cal-grid');
    const title = form.querySelector('.cal-title');
    const slotsBox = form.querySelector('.slots');
    const summary = form.querySelector('.summary');
    const errorsBox = form.querySelector('.form-errors');
    const done = document.querySelector('.booking-done');
    const fDate = form.elements.date;
    const fTime = form.elements.time;
    const prevBtn = form.querySelector('.cal-nav[data-dir="-1"]');
    const nextBtn = form.querySelector('.cal-nav[data-dir="1"]');

    const pad = n => String(n).padStart(2, '0');
    const ymdOf = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

    // Current date and time in Kuala Lumpur, whatever the visitor's timezone.
    function nowKL() {
        const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
            timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(new Date()).map(x => [x.type, x.value]));
        return { ymd: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
    }

    const today = nowKL().ymd;
    const lastDay = (() => {
        const [y, m, d] = today.split('-').map(Number);
        return ymdOf(new Date(Date.UTC(y, m - 1, d + BOOKING_DAYS_AHEAD)));
    })();
    const minMonth = today.slice(0, 7);
    const maxMonth = lastDay.slice(0, 7);
    let view = minMonth;

    const barber = () => form.querySelector('input[name="barber"]:checked');
    const barberName = () => barber()?.closest('.pick').querySelector('strong').textContent ?? '';

    const shiftMonth = (ym, n) => {
        const [y, m] = ym.split('-').map(Number);
        return ymdOf(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7);
    };

    const weekday = ymd => {
        const [y, m, d] = ymd.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    };

    const prettyDate = ymd => {
        const [y, m, d] = ymd.split('-').map(Number);
        return `${HARI[weekday(ymd)]}, ${d} ${BULAN[m - 1]} ${y}`;
    };

    // {status: 'out' | 'closed' | 'open', slots: [{time, free}]}
    function dayInfo(ymd) {
        if (ymd < today || ymd > lastDay) return { status: 'out' };
        const h = SCHEDULE[weekday(ymd)];
        if (!h) return { status: 'closed' };
        const now = nowKL();
        const slots = [];
        for (let t = h[0]; t < h[1]; t++) {
            const time = `${pad(t)}:00`;
            slots.push({ time, free: ymd > now.ymd || time > now.hm });
        }
        return { status: 'open', slots };
    }

    function render() {
        const [y, m] = view.split('-').map(Number);
        title.textContent = `${BULAN[m - 1]} ${y}`;
        prevBtn.disabled = view <= minMonth;
        nextBtn.disabled = view >= maxMonth;

        const offset = (weekday(`${view}-01`) + 6) % 7; // weeks start on Isnin
        const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const cells = HARI_PENDEK.map(h => `<span class="cal-dow">${h}</span>`);
        for (let i = 0; i < offset; i++) cells.push('<span class="cal-day cal-blank"></span>');

        for (let d = 1; d <= total; d++) {
            const ymd = `${view}-${pad(d)}`;
            const info = dayInfo(ymd);
            let cls = 'cal-day', label = '', disabled = true;
            if (info.status === 'out') {
                cls += ' is-out';
            } else if (info.status === 'closed') {
                cls += ' is-closed'; label = 'Tutup';
            } else if (!info.slots.some(s => s.free)) {
                cls += ' is-out'; label = 'Tamat';
            } else {
                cls += ' is-open'; label = 'Buka'; disabled = false;
            }
            if (ymd === fDate.value) cls += ' is-selected';
            cells.push(`<button type="button" class="${cls}" data-date="${ymd}" ${disabled ? 'disabled' : ''}
                aria-label="${prettyDate(ymd)}${label ? ', ' + label : ''}"><b>${d}</b><small>${label}</small></button>`);
        }
        grid.innerHTML = cells.join('');
        renderSlots();
    }

    function renderSlots() {
        if (!fDate.value) {
            slotsBox.innerHTML = '<p class="cal-msg">Pilih tarikh dahulu.</p>';
        } else {
            const info = dayInfo(fDate.value);
            slotsBox.innerHTML = `<p class="slots-date">${prettyDate(fDate.value)}</p><div class="slot-list">` +
                info.slots.map(s => `<button type="button" class="slot${s.time === fTime.value ? ' is-selected' : ''}"
                    data-time="${s.time}" ${s.free ? '' : 'disabled'}>${s.time}${s.free ? '' : '<small>Tamat</small>'}</button>`).join('') +
                '</div>';
        }
        updateSummary();
    }

    function updateSummary() {
        if (barber() && fDate.value && fTime.value) {
            summary.innerHTML = `<b>${barberName()}</b> · ${prettyDate(fDate.value)} · <b>${fTime.value}</b>`;
        } else {
            summary.textContent = 'Pilih barber, tarikh dan masa.';
        }
    }

    function showErrors(errors) {
        errorsBox.innerHTML = errors.map(e => `<li>${e}</li>`).join('');
        errorsBox.hidden = !errors.length;
    }

    form.addEventListener('change', e => {
        if (e.target.name === 'barber') updateSummary();
    });

    grid.addEventListener('click', e => {
        const btn = e.target.closest('.cal-day[data-date]');
        if (!btn || btn.disabled) return;
        fDate.value = btn.dataset.date;
        fTime.value = '';
        render();
        slotsBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    slotsBox.addEventListener('click', e => {
        const btn = e.target.closest('.slot');
        if (!btn || btn.disabled) return;
        fTime.value = btn.dataset.time;
        renderSlots();
    });

    [prevBtn, nextBtn].forEach(btn => btn.addEventListener('click', () => {
        view = shiftMonth(view, Number(btn.dataset.dir));
        render();
    }));

    form.addEventListener('submit', e => {
        e.preventDefault();
        const name = form.elements.name.value.trim();
        const phone = form.elements.phone.value.trim();
        const service = form.elements.service.value;

        const errors = [];
        if (!barber()) errors.push('Sila pilih barber.');
        if (!fDate.value) errors.push('Sila pilih tarikh dalam kalendar.');
        else if (!fTime.value || !dayInfo(fDate.value).slots?.some(s => s.free && s.time === fTime.value)) errors.push('Sila pilih masa yang masih dibuka.');
        if (!name) errors.push('Sila masukkan nama anda.');
        if (!/^\+?[0-9][0-9 \-]{7,14}$/.test(phone)) errors.push('Sila masukkan nombor telefon yang sah.');
        if (!service) errors.push('Sila pilih servis.');
        showErrors(errors);
        if (errors.length) {
            errorsBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        const serviceName = service.split(' — ')[0];
        const message = [
            'Salam, saya nak buat tempahan di Skull & Shears:',
            `Nama: ${name}`,
            `Telefon: ${phone}`,
            `Barber: ${barberName()}`,
            `Tarikh: ${prettyDate(fDate.value)}`,
            `Masa: ${fTime.value}`,
            `Servis: ${serviceName}`,
        ].join('\n');
        const url = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank', 'noopener');

        const rows = [['Barber', barberName()], ['Tarikh', prettyDate(fDate.value)], ['Masa', fTime.value], ['Servis', serviceName]];
        const receipt = done.querySelector('.receipt');
        receipt.replaceChildren(...rows.flatMap(([k, v]) => {
            const dt = document.createElement('dt'); dt.textContent = k;
            const dd = document.createElement('dd'); dd.textContent = v;
            return [dt, dd];
        }));
        done.querySelector('.wa-link').href = url;
        done.hidden = false;
        done.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    render();
})();
