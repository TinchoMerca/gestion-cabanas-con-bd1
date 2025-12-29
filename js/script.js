// ==========================================
// 1. CONFIGURACIÓN DE FIREBASE
// ==========================================

const firebaseConfig = {
    apiKey: "AIzaSyCiXZOBRVurPwOFAOA6RNJaq-JQME6S-3o",
    authDomain: "gestion-de-reservas-64793.firebaseapp.com",
    projectId: "gestion-de-reservas-64793",
    storageBucket: "gestion-de-reservas-64793.firebasestorage.app",
    messagingSenderId: "651272756454",
    appId: "1:651272756454:web:a2622956cd731a8ef0ef27",
    measurementId: "G-Q5LE83PNFH"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth(); // Inicializamos Auth

// ==========================================
// 2. VARIABLES Y DOM
// ==========================================
let currentDate = new Date();
let bookings = [];
let editingBookingId = null;

const monthYear = document.getElementById('monthYear');
const daysContainer = document.getElementById('daysContainer');
const cabinFilter = document.getElementById('cabinFilter');

const Toast = Swal.mixin({
    toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true
});

// ==========================================
// 3. SISTEMA DE LOGIN (SEGURIDAD)
// ==========================================

// Escuchar si el usuario entra o sale
auth.onAuthStateChanged((user) => {
    if (user) {
        // --- USUARIO LOGUEADO ---
        console.log("Usuario conectado:", user.email);
        iniciarApp(); // Cargar datos
        mostrarBotonLogout();
    } else {
        // --- USUARIO DESCONECTADO ---
        console.log("Nadie conectado");
        bookings = []; // Limpiar datos de la vista
        renderCalendar(); // Mostrar calendario vacío
        pedirLogin(); // Mostrar ventana de login
    }
});

function pedirLogin() {
    Swal.fire({
        title: 'Acceso Familiar',
        // Agregamos el Checkbox en el HTML del alerta
        html: `
            <input type="email" id="loginEmail" class="swal2-input" placeholder="Correo">
            <input type="password" id="loginPass" class="swal2-input" placeholder="Contraseña">
            
            <div style="display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 15px;">
                <input type="checkbox" id="showPass" style="width: 18px; height: 18px; cursor: pointer;">
                <label for="showPass" style="cursor: pointer; font-size: 0.9rem; color: #555;">Mostrar contraseña</label>
            </div>
        `,
        confirmButtonText: 'Entrar',
        allowOutsideClick: false,
        allowEscapeKey: false,
        // didOpen se ejecuta apenas se abre la ventana
        didOpen: () => {
            const loginPass = Swal.getPopup().querySelector('#loginPass');
            const showPass = Swal.getPopup().querySelector('#showPass');

            // Escuchamos el click en el checkbox
            showPass.addEventListener('change', () => {
                // Si está marcado, mostramos texto. Si no, mostramos password (puntos)
                loginPass.type = showPass.checked ? 'text' : 'password';
            });
        },
        preConfirm: () => {
            const email = Swal.getPopup().querySelector('#loginEmail').value;
            const password = Swal.getPopup().querySelector('#loginPass').value;
            if (!email || !password) {
                Swal.showValidationMessage(`Por favor ingresa usuario y contraseña`);
            }
            return { email: email, password: password };
        }
    }).then((result) => {
        auth.signInWithEmailAndPassword(result.value.email, result.value.password)
            .then(() => {
                Toast.fire({ icon: 'success', title: '¡Bienvenido!' });
            })
            .catch((error) => {
                Swal.fire({ icon: 'error', title: 'Error', text: 'Datos incorrectos' })
                    .then(() => pedirLogin());
            });
    });
}

function cerrarSesion() {
    auth.signOut().then(() => {
        location.reload(); // Recargar página para limpiar todo
    });
}

// Agregar botón de Salir en el Header dinámicamente
function mostrarBotonLogout() {
    const headerActions = document.querySelector('.header-actions');
    // Evitar duplicados
    if (document.getElementById('btnLogout')) return;

    const btn = document.createElement('button');
    btn.id = 'btnLogout';
    btn.className = 'btn btn-outline';
    btn.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
    btn.title = "Cerrar Sesión";
    btn.style.color = "#e74c3c";
    btn.style.borderColor = "#e74c3c";
    btn.onclick = cerrarSesion;

    headerActions.prepend(btn);
}

// ==========================================
// 4. LÓGICA DE DATOS (Solo arranca si hay login)
// ==========================================

function iniciarApp() {
    // Escuchar cambios en la base de datos
    db.collection("reservas").onSnapshot((snapshot) => {
        bookings = [];
        snapshot.forEach((doc) => {
            bookings.push({ id: doc.id, ...doc.data() });
        });
        renderCalendar();
        renderBookingList();
        updateGuestHistory();
        renderDailyAlerts();
    }, (error) => {
        console.error("Error al leer datos:", error);
        // Si da error de permisos, es que no está logueado
    });

    db.collection("config").doc("notas_generales").onSnapshot((doc) => {
        if (doc.exists) document.getElementById('notesArea').value = doc.data().contenido || "";
    });
}

// ==========================================
// 5. CALENDARIO Y UI
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // Solo render inicial (vacío hasta que haya login)
    renderCalendar();
});

// --- [NUEVO] Función para arreglar el bug de las 21hs ---
function getLocalToday() {
    const d = new Date();
    // Ajustamos manualmente restando el desfase de zona horaria
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
}

function renderCalendar() {
    const filter = cabinFilter.value;
    currentDate.setDate(1);
    const month = currentDate.getMonth();
    const year = currentDate.getFullYear();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = currentDate.getDay();

    const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    monthYear.innerText = `${months[month]} ${year}`;

    let daysHTML = "";
    for (let i = 0; i < firstDayIndex; i++) daysHTML += `<div class="day empty"></div>`;

    const allCabins = ["Cabaña 1", "Cabaña 2", "Cabaña 3", "Cabaña 4", "Cabaña 5"];

    // Usamos la nueva función para saber qué día es hoy realmente
    const todayReal = getLocalToday();

    for (let i = 1; i <= lastDay; i++) {
        const dateObj = new Date(year, month, i);
        const dateStr = formatDate(dateObj);

        // CORREGIDO: Usamos todayReal en vez de formatDate(new Date())
        const isToday = dateStr === todayReal ? "today" : "";
        let slotsHTML = "";

        // Si no hay reservas cargadas (no login), esto simplemente no mostrará nada
        const cabinsToShow = (filter === 'all') ? allCabins : [filter];

        cabinsToShow.forEach(cabinName => {
            const endingBooking = bookings.find(b => b.cabin === cabinName && b.end === dateStr);
            const startingBooking = bookings.find(b => b.cabin === cabinName && b.start === dateStr);
            const ongoingBooking = bookings.find(b => b.cabin === cabinName && b.start < dateStr && b.end > dateStr);

            if (endingBooking && startingBooking) {
                slotsHTML += `
                <div class="booking-slot">
                    <div class="double-bar-container">
                        <div class="half-bar half-left bg-${endingBooking.status}" onclick="editBooking('${endingBooking.id}', event)" title="Sale: ${endingBooking.guest}">
                             <i class="fas fa-sign-out-alt"></i>&nbsp;${endingBooking.guest.split(' ')[0]}
                        </div>
                        <div class="half-bar half-right bg-${startingBooking.status}" onclick="editBooking('${startingBooking.id}', event)" title="Entra: ${startingBooking.guest}">
                             ${startingBooking.guest.split(' ')[0]}&nbsp;<i class="fas fa-sign-in-alt"></i>
                        </div>
                    </div>
                </div>`;
            } else {
                const booking = endingBooking || startingBooking || ongoingBooking;
                if (booking) {
                    let barClass = "bar-mid";
                    if (booking.start === booking.end) barClass = "bar-single";
                    else if (dateStr === booking.start) barClass = "bar-start";
                    else if (dateStr === booking.end) barClass = "bar-end";

                    let content = "&nbsp;";
                    if (dateStr === booking.start) content = `<i class="fas fa-sign-in-alt icon-in"></i> ${booking.guest.split(' ')[0]}`;
                    else if (dateStr === booking.end) content = `<i class="fas fa-sign-out-alt icon-out"></i>`;
                    else if (i === 1) content = booking.guest.split(' ')[0];

                    slotsHTML += `<div class="booking-slot" title="${booking.cabin}: ${booking.guest}">
                                    <div class="booking-bar ${barClass} bg-${booking.status}" onclick="editBooking('${booking.id}', event)">
                                        ${content}
                                    </div>
                                  </div>`;
                } else {
                    slotsHTML += `<div class="booking-slot"><div class="booking-placeholder"></div></div>`;
                }
            }
        });
        daysHTML += `<div class="day ${isToday}"><div class="day-number">${i}</div>${slotsHTML}</div>`;
    }
    daysContainer.innerHTML = daysHTML;
    calculateMonthlyStats();
    renderBookingList();

    if (document.getElementById('appLoader')) {
        document.getElementById('appLoader').style.display = 'none';
    }
}

function changeMonth(direction) { currentDate.setMonth(currentDate.getMonth() + direction); renderCalendar(); }

// ==========================================
// 6. GUARDAR Y EDITAR (Protegido por Auth)
// ==========================================

function saveBooking() {
    if (!auth.currentUser) return Swal.fire('Error', 'Debes iniciar sesión', 'error');

    const guest = document.getElementById('guestName').value;
    const phone = document.getElementById('guestPhone').value;
    const cabin = document.getElementById('cabinName').value;
    const start = document.getElementById('checkIn').value;
    const end = document.getElementById('checkOut').value;
    const price = parseFloat(document.getElementById('pricePerNight').value) || 0;
    const status = document.getElementById('paymentStatus').value;

    if (!guest || !start || !end) { Swal.fire({ icon: 'warning', title: 'Faltan datos' }); return; }
    if (start > end) { Swal.fire({ icon: 'error', title: 'Fechas inválidas' }); return; }

    const conflict = checkOverlap(cabin, start, end, editingBookingId);
    if (conflict) { Swal.fire({ icon: 'error', title: '¡Superposición!', text: `La ${cabin} ya está ocupada.` }); return; }

    const nights = calculateNights(start, end);
    const total = nights * price;
    const bookingData = { guest, phone, cabin, start, end, pricePerNight: price, status, totalPrice: total };

    if (editingBookingId) {
        db.collection("reservas").doc(editingBookingId).update(bookingData)
            .then(() => { closeModal(); Toast.fire({ icon: 'success', title: 'Actualizado' }); });
    } else {
        db.collection("reservas").add(bookingData)
            .then(() => { closeModal(); Toast.fire({ icon: 'success', title: 'Guardado' }); });
    }
}

function deleteFromModal() {
    if (!auth.currentUser) return;
    if (!editingBookingId) return;
    Swal.fire({
        title: '¿Eliminar?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#eb3b5a', confirmButtonText: 'Sí, borrar'
    }).then((result) => {
        if (result.isConfirmed) {
            db.collection("reservas").doc(editingBookingId).delete()
                .then(() => { closeModal(); Toast.fire({ icon: 'success', title: 'Eliminado' }); });
        }
    });
}

// Guardar notas con debounce y verificación de usuario
let timeoutNotas;
document.getElementById('notesArea').addEventListener('input', (e) => {
    if (!auth.currentUser) return;
    clearTimeout(timeoutNotas);
    timeoutNotas = setTimeout(() => {
        db.collection("config").doc("notas_generales").set({ contenido: e.target.value });
    }, 1000);
});

// ==========================================
// 7. UTILIDADES
// ==========================================
function checkOverlap(cabin, start, end, ignoreId = null) {
    const newStart = new Date(start);
    const newEnd = new Date(end);
    return bookings.find(b => {
        if (ignoreId && b.id === ignoreId) return false;
        if (b.cabin !== cabin) return false;
        const bStart = new Date(b.start);
        const bEnd = new Date(b.end);
        return newStart < bEnd && newEnd > bStart;
    });
}

function openModal() {
    if (!auth.currentUser) { pedirLogin(); return; } // Proteger botón Nueva Reserva
    editingBookingId = null; cleanForm(); document.getElementById('modalTitle').innerText = "Nueva Reserva"; document.getElementById('btnDeleteModal').style.display = 'none'; document.getElementById('bookingModal').style.display = 'flex';
}
function closeModal() { document.getElementById('bookingModal').style.display = 'none'; }
window.onclick = function (e) { if (e.target == document.getElementById('bookingModal')) closeModal(); }
function cleanForm() { document.getElementById('guestName').value = ""; document.getElementById('guestPhone').value = ""; document.getElementById('checkIn').value = ""; document.getElementById('checkOut').value = ""; document.getElementById('pricePerNight').value = ""; document.getElementById('totalPreview').innerText = "Total estimado: $0"; }

function editBooking(id, event) {
    if (event) event.stopPropagation();
    const booking = bookings.find(b => b.id === id);
    if (!booking) return;
    editingBookingId = id;
    document.getElementById('modalTitle').innerText = "Editar Reserva";
    document.getElementById('guestName').value = booking.guest;
    document.getElementById('guestPhone').value = booking.phone;
    document.getElementById('cabinName').value = booking.cabin;
    document.getElementById('checkIn').value = booking.start;
    document.getElementById('checkOut').value = booking.end;
    document.getElementById('pricePerNight').value = booking.pricePerNight;
    document.getElementById('paymentStatus').value = booking.status;
    calculateTotalPreview();
    document.getElementById('btnDeleteModal').style.display = 'block';
    document.getElementById('bookingModal').style.display = 'flex';
}

function calculateMonthlyStats() {
    const month = currentDate.getMonth();
    const year = currentDate.getFullYear();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const monthBookings = bookings.filter(b => {
        const bStart = new Date(b.start);
        const bEnd = new Date(b.end);
        return bStart <= monthEnd && bEnd >= monthStart;
    });
    const totalRevenue = monthBookings.reduce((acc, b) => acc + (parseFloat(b.totalPrice) || 0), 0);
    document.getElementById('monthRevenue').innerText = `$${totalRevenue.toLocaleString()}`;
    document.getElementById('monthOccupancy').innerText = monthBookings.length;
}

function renderBookingList() {
    const listDiv = document.getElementById('bookingList');
    const month = currentDate.getMonth();
    const upcoming = bookings.filter(b => {
        const d = new Date(b.start);
        return d.getMonth() === month && d.getFullYear() === currentDate.getFullYear();
    }).sort((a, b) => new Date(a.start) - new Date(b.start));

    let html = "";
    upcoming.forEach(b => {
        let borderClass = b.status === 'paid' ? 'var(--success)' : (b.status === 'deposit' ? 'var(--warning)' : '#ccc');
        html += `<div class="booking-list-item" style="border-left-color: ${borderClass}">
                    <div><strong>${b.guest}</strong> <small>(${b.cabin})</small><br><span style="color:#777; font-size:0.8rem">📅 ${b.start.slice(8)} al ${b.end.slice(8)}</span></div>
                    <button class="btn" onclick="editBooking('${b.id}')"><i class="fas fa-pencil-alt" style="color:#aaa"></i></button>
                 </div>`;
    });
    listDiv.innerHTML = html || "<p style='color:#ccc; text-align:center'>Sin datos...</p>";
}

function searchBooking() {
    const text = document.getElementById('searchInput').value.toLowerCase();
    const listDiv = document.getElementById('bookingList');
    if (text.length === 0) { renderBookingList(); return; }
    const filtered = bookings.filter(b => b.guest.toLowerCase().includes(text));
    let html = "";
    filtered.forEach(b => {
        html += `<div class="booking-list-item" style="border-left-color: var(--primary)"><span>${b.guest} (${b.cabin}) <br> <small>${b.start} al ${b.end}</small></span><button class="btn" onclick="editBooking('${b.id}')"><i class="fas fa-edit"></i></button></div>`;
    });
    listDiv.innerHTML = html || "<p>No encontrado.</p>";
}

function updateGuestHistory() {
    const dataList = document.getElementById('guestHistory');
    dataList.innerHTML = '';
    const guests = [...new Set(bookings.map(b => b.guest))];
    guests.forEach(name => { const option = document.createElement('option'); option.value = name; dataList.appendChild(option); });
}

function exportToPDF() {
    const { jsPDF } = window.jspdf;
    const month = currentDate.getMonth();
    const year = currentDate.getFullYear();
    const monthName = document.getElementById('monthYear').innerText;
    const monthlyBookings = bookings.filter(b => {
        const start = new Date(b.start); const end = new Date(b.end);
        return (start.getMonth() === month && start.getFullYear() === year) || (end.getMonth() === month && end.getFullYear() === year) || (start < new Date(year, month, 1) && end > new Date(year, month + 1, 0));
    });
    if (monthlyBookings.length === 0) { Swal.fire({ icon: 'info', title: 'Sin datos' }); return; }
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text("Reporte - Mis Cabañas", 14, 20);
    doc.setFontSize(12); doc.setTextColor(100); doc.text(`Período: ${monthName}`, 14, 28);
    const tableColumn = ["Cabaña", "Huesped", "Entrada", "Salida", "Noches", "Total", "Estado"];
    let totalMoney = 0;
    const tableRows = monthlyBookings.map(b => {
        totalMoney += parseFloat(b.totalPrice) || 0;
        let statusEsp = b.status === 'paid' ? "Pagado" : (b.status === 'deposit' ? "Señado" : "Pendiente");
        return [b.cabin, b.guest, b.start, b.end, calculateNights(b.start, b.end), `$${b.totalPrice.toLocaleString()}`, statusEsp];
    });
    doc.autoTable({ head: [tableColumn], body: tableRows, startY: 35, theme: 'grid', headStyles: { fillColor: [74, 105, 189] }, styles: { fontSize: 9 } });
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12); doc.setTextColor(0); doc.text(`Ingresos Totales: $${totalMoney.toLocaleString()}`, 14, finalY);
    doc.save(`Reporte_${monthName.replace(' ', '_')}.pdf`);
}

function calculateTotalPreview() { const start = document.getElementById('checkIn').value; const end = document.getElementById('checkOut').value; const price = document.getElementById('pricePerNight').value; if (start && end && price) { const total = calculateNights(start, end) * price; document.getElementById('totalPreview').innerText = `Total estimado: $${total.toLocaleString()}`; } }
function calculateNights(start, end) { const d1 = new Date(start); const d2 = new Date(end); return Math.max(1, Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24))); }
function formatDate(date) { return date.toISOString().split('T')[0]; }

// Función para mostrar Avisos del Día (Check-in / Check-out)
function renderDailyAlerts() {
    // CORREGIDO: Usamos la hora local para filtrar
    const todayStr = getLocalToday();
    const container = document.getElementById('dailyAlerts');

    // Buscar Entradas (Start == Hoy)
    const checkIns = bookings.filter(b => b.start === todayStr);

    // Buscar Salidas (End == Hoy)
    const checkOuts = bookings.filter(b => b.end === todayStr);

    let html = "";

    // Crear tarjetas de Entradas
    checkIns.forEach(b => {
        html += `
        <div class="alert-card alert-in" onclick="editBooking('${b.id}')" style="cursor:pointer">
            <i class="fas fa-suitcase-rolling"></i>
            <div>
                <div><strong>Entra:</strong> ${b.guest.split(' ')[0]}</div>
                <small>${b.cabin}</small>
            </div>
        </div>`;
    });

    // Crear tarjetas de Salidas
    checkOuts.forEach(b => {
        html += `
        <div class="alert-card alert-out" onclick="editBooking('${b.id}')" style="cursor:pointer">
            <i class="fas fa-sign-out-alt"></i>
            <div>
                <div><strong>Sale:</strong> ${b.guest.split(' ')[0]}</div>
                <small>${b.cabin}</small>
            </div>
        </div>`;
    });

    // Si no hay nada
    if (html === "") {
        html = `<div class="alert-card alert-empty">😴 Sin movimientos hoy</div>`;
    }

    container.innerHTML = html;
}