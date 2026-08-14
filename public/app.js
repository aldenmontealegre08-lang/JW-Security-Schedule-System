// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDky02aMkvBY1Imz7GJWawBu1MqLR5qyE",
    authDomain: "jw-security-schedule-system.firebaseapp.com",
    projectId: "jw-security-schedule-system",
    storageBucket: "jw-security-schedule-system.appspot.com",
    messagingSenderId: "405577245994",
    appId: "1:405577245994:web:edf9c0415078b0803e2a53",
    measurementId: "G-TFBKBV3731"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let schedules = [];
let currentRole = sessionStorage.getItem('userRole');
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const MAX_VOLUNTEERS_PER_SLOT = 6;

// --- SECURITY HELPER: XSS SANITIZATION ---
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// --- DYNAMIC TIME PARSER FOR ACCURATE CHRONOLOGICAL SORTING ---
function getStartTimeInMinutes(timeSlotStr) {
    if (!timeSlotStr) return 0;
    
    const startTimeRaw = timeSlotStr.split('-')[0].trim().toLowerCase();
    const match = startTimeRaw.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)$/);
    if (!match) return 0;

    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const modifier = match[3];

    if (modifier === 'pm' && hours < 12) hours += 12;
    if (modifier === 'am' && hours === 12) hours = 0;

    return hours * 60 + minutes;
}

// --- ROUTING & AUTHENTICATION GUARD ---
function evaluateAccessControl() {
    const isLoginPage = !!document.getElementById('loginForm');
    const isDashboardPage = !!document.getElementById('khTableBody');
    currentRole = sessionStorage.getItem('userRole');

    if (isLoginPage) {
        if (currentRole === 'admin' || currentRole === 'user') {
            window.location.replace('dashboard.html');
            return false;
        }
    } else if (isDashboardPage) {
        if (!currentRole) {
            window.location.replace('index.html');
            return false;
        }

        document.body.classList.remove('role-admin', 'role-user');
        document.body.classList.add(`role-${currentRole}`);
        
        const indicator = document.getElementById('roleIndicator');
        if (indicator) {
            if (currentRole === 'admin') {
                indicator.textContent = "Admin Mode";
                indicator.className = "role-badge admin";
            } else {
                indicator.textContent = "Volunteer Portal";
                indicator.className = "role-badge user";
            }
        }

        document.body.style.display = 'block';
        return true;
    }
    return true;
}

document.addEventListener('DOMContentLoaded', () => {
    if (evaluateAccessControl() && document.getElementById('khTableBody')) {
        initDatabase();
    }
});

window.addEventListener('pageshow', (event) => {
    if (event.persisted || (window.performance && window.performance.navigation && window.performance.navigation.type === 2)) {
        evaluateAccessControl();
    }
});

// --- CREDENTIAL LOGIN & LOGOUT HANDLERS ---
function handleLogin(event) {
    event.preventDefault();
    const usernameInput = document.getElementById('usernameInput');
    const passwordInput = document.getElementById('passwordInput');
    const errorMsg = document.getElementById('loginError');

    const username = usernameInput ? usernameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value.trim() : '';

    if (username === 'admin' && password === 'admin123') {
        currentRole = 'admin';
    } else if (username === 'user' && password === 'user123') {
        currentRole = 'user';
    } else {
        if (errorMsg) {
            errorMsg.textContent = "Invalid username or password. Please try again.";
            errorMsg.style.display = 'block';
        }
        return;
    }

    sessionStorage.setItem('userRole', currentRole);
    window.location.replace('dashboard.html');
}

function handleLogout() {
    sessionStorage.clear();
    currentRole = null;
    window.location.replace('index.html');
}

// --- PASSWORD VISIBILITY TOGGLE (MOBILE OPTIMIZED) ---
function togglePasswordVisibility() {
    const passwordInput = document.getElementById('passwordInput');
    const toggleIcon = document.getElementById('togglePasswordIcon');
    if (!passwordInput || !toggleIcon) return;

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.classList.remove('fa-eye');
        toggleIcon.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        toggleIcon.classList.remove('fa-eye-slash');
        toggleIcon.classList.add('fa-eye');
    }
}

function printDailySchedule() {
    window.print();
}

function getGMT8DateString(dateObj = new Date()) {
    const options = { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' };
    return new Intl.DateTimeFormat('en-CA', options).format(dateObj);
}

function saveDailyLog() {
    const todayStr = getGMT8DateString();
    
    const logData = schedules.map(slot => ({
        id: slot.id,
        facility_id: slot.facility_id,
        facility_name: slot.facility_id === 1 ? 'Kingdom Hall Security' : 'Bunk House Security',
        time_slot: slot.time_slot,
        volunteer_names: slot.volunteer_names,
        status: slot.status
    }));

    return db.collection("daily_logs").doc(todayStr).set({
        date: todayStr,
        timezone: "GMT+8",
        last_updated: Date.now(),
        records: logData
    }, { merge: true });
}

function checkAndAutoResetSchedules(snapshot) {
    const now = Date.now();
    const batch = db.batch();
    let hasResets = false;

    snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.status === 'Confirmed' && data.last_updated) {
            if (now - data.last_updated >= TWENTY_FOUR_HOURS) {
                const docRef = db.collection("schedules").doc(doc.id);
                batch.update(docRef, {
                    volunteer_names: '',
                    status: 'Vacant',
                    last_updated: null
                });
                hasResets = true;
            }
        }
    });

    if (hasResets) {
        batch.commit().catch(console.error);
    }
}

// --- INITIALIZE & REALTIME LISTENERS ---
function initDatabase() {
    db.collection("schedules").get().then((snapshot) => {
        if (snapshot.empty) {
            seedDefaultDatabase();
        } else {
            listenToFirestore();
        }
    });
}

function seedDefaultDatabase() {
    const defaultSlots = [
        { id: 1, facility_id: 1, time_slot: '12:00am - 6:00am', volunteer_names: '', status: 'Vacant', last_updated: null },
        { id: 2, facility_id: 1, time_slot: '6:00am - 9:00am', volunteer_names: '', status: 'Vacant', last_updated: null },
        { id: 3, facility_id: 1, time_slot: '9:00am - 12:00pm', volunteer_names: '', status: 'Vacant', last_updated: null },
        { id: 4, facility_id: 1, time_slot: '12:00pm - 3:00pm', volunteer_names: '', status: 'Vacant', last_updated: null },
        { id: 5, facility_id: 1, time_slot: '3:00pm - 6:00pm', volunteer_names: '', status: 'Vacant', last_updated: null },
        { id: 6, facility_id: 1, time_slot: '6:00pm - 9:00pm', volunteer_names: '', status: 'Vacant', last_updated: null },
        { id: 7, facility_id: 1, time_slot: '9:00pm - 11:59pm', volunteer_names: '', status: 'Vacant', last_updated: null },

        { id: 8, facility_id: 2, time_slot: '12:00am - 6:00am', volunteer_names: '', status: 'Vacant', last_updated: null },
        { id: 9, facility_id: 2, time_slot: '6:00am - 9:00am', volunteer_names: '', status: 'Vacant', last_updated: null },
        { id: 10, facility_id: 2, time_slot: '9:00am - 12:00pm', volunteer_names: '', status: 'Vacant', last_updated: null },
        { id: 11, facility_id: 2, time_slot: '12:00pm - 3:00pm', volunteer_names: '', status: 'Vacant', last_updated: null },
        { id: 12, facility_id: 2, time_slot: '3:00pm - 6:00pm', volunteer_names: '', status: 'Vacant', last_updated: null },
        { id: 13, facility_id: 2, time_slot: '6:00pm - 9:00pm', volunteer_names: '', status: 'Vacant', last_updated: null },
        { id: 14, facility_id: 2, time_slot: '9:00pm - 11:59pm', volunteer_names: '', status: 'Vacant', last_updated: null }
    ];

    const batch = db.batch();
    defaultSlots.forEach(slot => {
        const docRef = db.collection("schedules").doc(slot.id.toString());
        batch.set(docRef, slot);
    });
    batch.commit().then(() => {
        listenToFirestore();
    });
}

function listenToFirestore() {
    db.collection("schedules").onSnapshot((snapshot) => {
        checkAndAutoResetSchedules(snapshot);

        schedules = [];
        snapshot.forEach((doc) => {
            schedules.push(doc.data());
        });

        // SORTED BY FACILITY FIRST (KINGDOM HALL = 1, BUNK HOUSE = 2), THEN CHRONOLOGICALLY BY TIME
        schedules.sort((a, b) => {
            if (a.facility_id !== b.facility_id) {
                return a.facility_id - b.facility_id;
            }
            const timeA = getStartTimeInMinutes(a.time_slot);
            const timeB = getStartTimeInMinutes(b.time_slot);
            return timeA - timeB;
        });

        renderTables();
        saveDailyLog();
    });
}

// --- RENDER TABLES ---
function renderTables() {
    const khBody = document.getElementById('khTableBody');
    const bunkBody = document.getElementById('bunkTableBody');
    
    if (!khBody || !bunkBody) return;

    khBody.innerHTML = '';
    bunkBody.innerHTML = '';

    schedules.forEach(item => {
        const row = document.createElement('tr');
        const badgeClass = item.status === 'Confirmed' ? 'confirmed' : 'vacant';
        const volunteerDisplay = item.volunteer_names 
            ? escapeHTML(item.volunteer_names) 
            : '<span style="color: #94a3b8; font-style: italic;">Unassigned Slot</span>';

        row.innerHTML = `
            <td>${escapeHTML(item.time_slot)}</td>
            <td>${volunteerDisplay}</td>
            <td><span class="badge ${badgeClass}">${escapeHTML(item.status)}</span></td>
            <td class="admin-only text-right">
                <button class="btn-icon edit" onclick="openEditAdminModal(${item.id})" title="Edit Slot"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon delete" onclick="deleteRecord(${item.id})" title="Clear Slot Volunteers"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;

        if (item.facility_id === 1) {
            khBody.appendChild(row);
        } else {
            bunkBody.appendChild(row);
        }
    });
}

// --- RESET ALL SCHEDULES AND RESTORE DEFAULT SEQUENTIAL SLOTS ---
function resetAllSchedules() {
    if (currentRole !== 'admin') return;

    const confirmReset = confirm("Are you sure you want to RESET ALL SCHEDULES?\n\nThis will restore both facilities to sequential order (12:00am - 11:59pm) and archive today's log.");
    if (!confirmReset) return;

    saveDailyLog().then(() => {
        return db.collection("schedules").get();
    }).then((snapshot) => {
        const batch = db.batch();
        snapshot.forEach((doc) => {
            batch.delete(doc.ref);
        });
        return batch.commit();
    }).then(() => {
        seedDefaultDatabase();
        alert("Schedules have been reset and restored to proper sequential order!");
    }).catch((error) => {
        alert("Error during reset: " + error.message);
    });
}

// --- HISTORY LOGS ---
function openHistoryModal() {
    if (currentRole !== 'admin') return;

    const datePicker = document.getElementById('historyDateSelect');
    if (datePicker) {
        datePicker.value = getGMT8DateString();
        fetchHistoryForSelectedDate();
    }
    document.getElementById('historyModal').style.display = 'flex';
}

function closeHistoryModal() {
    document.getElementById('historyModal').style.display = 'none';
}

function fetchHistoryForSelectedDate() {
    const selectedDate = document.getElementById('historyDateSelect').value;
    const khBody = document.getElementById('historyKhBody');
    const bunkBody = document.getElementById('historyBunkBody');

    if (!selectedDate || !khBody || !bunkBody) return;

    khBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Loading history...</td></tr>';
    bunkBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Loading history...</td></tr>';

    db.collection("daily_logs").doc(selectedDate).get().then((doc) => {
        if (!doc.exists) {
            khBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #94a3b8;">No history recorded for this date.</td></tr>';
            bunkBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #94a3b8;">No history recorded for this date.</td></tr>';
            return;
        }

        const data = doc.data();
        let records = data.records || [];

        records.sort((a, b) => {
            if (a.facility_id !== b.facility_id) {
                return a.facility_id - b.facility_id;
            }
            return getStartTimeInMinutes(a.time_slot) - getStartTimeInMinutes(b.time_slot);
        });

        khBody.innerHTML = '';
        bunkBody.innerHTML = '';

        if (records.length === 0) {
            khBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #94a3b8;">No shift records found.</td></tr>';
            bunkBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #94a3b8;">No shift records found.</td></tr>';
            return;
        }

        records.forEach(item => {
            const row = document.createElement('tr');
            const badgeClass = item.status === 'Confirmed' ? 'confirmed' : 'vacant';
            const volunteerDisplay = item.volunteer_names 
                ? escapeHTML(item.volunteer_names) 
                : '<span style="color: #94a3b8; font-style: italic;">Unassigned Slot</span>';

            row.innerHTML = `
                <td><strong>${escapeHTML(item.time_slot)}</strong></td>
                <td>${volunteerDisplay}</td>
                <td><span class="badge ${badgeClass}">${escapeHTML(item.status)}</span></td>
            `;

            if (item.facility_id === 1) {
                khBody.appendChild(row);
            } else {
                bunkBody.appendChild(row);
            }
        });

    }).catch((error) => {
        alert("Error fetching history log: " + error.message);
    });
}

// --- USER FORM SUBMISSION WITH GROUPED OPTGROUPS & CAPACITY DISPLAY ---
function openVolunteerFormModal() {
    const timeSlotSelect = document.getElementById('formTimeSlotSelect');
    if (!timeSlotSelect) return;
    
    timeSlotSelect.innerHTML = '';

    if (schedules.length === 0) {
        timeSlotSelect.innerHTML = '<option disabled selected>No time slots available</option>';
    } else {
        const khGroup = document.createElement('optgroup');
        khGroup.label = "Kingdom Hall Security";

        const bunkGroup = document.createElement('optgroup');
        bunkGroup.label = "Bunk House Security";

        schedules.forEach(slot => {
            const facilityName = slot.facility_id === 1 ? 'Kingdom Hall' : 'Bunk House';
            const volCount = slot.volunteer_names 
                ? slot.volunteer_names.split(',').map(n => n.trim()).filter(n => n.length > 0).length 
                : 0;
            const isFull = volCount >= MAX_VOLUNTEERS_PER_SLOT;

            const opt = document.createElement('option');
            opt.value = slot.id;
            opt.textContent = `${facilityName} — ${slot.time_slot} (${volCount}/${MAX_VOLUNTEERS_PER_SLOT} Volunteers)${isFull ? ' [FULL]' : ''}`;
            if (isFull) {
                opt.disabled = true;
            }

            if (slot.facility_id === 1) {
                khGroup.appendChild(opt);
            } else {
                bunkGroup.appendChild(opt);
            }
        });

        if (khGroup.children.length > 0) timeSlotSelect.appendChild(khGroup);
        if (bunkGroup.children.length > 0) timeSlotSelect.appendChild(bunkGroup);
    }

    document.getElementById('shiftSubmissionForm').reset();
    document.getElementById('volunteerFormModal').style.display = 'flex';
}

function closeVolunteerFormModal() {
    document.getElementById('volunteerFormModal').style.display = 'none';
}

function submitVolunteerShift(event) {
    event.preventDefault();
    const newVolunteerName = document.getElementById('volunteerFullName').value.trim();
    const slotId = parseInt(document.getElementById('formTimeSlotSelect').value);

    if (!newVolunteerName) {
        alert("Please enter your name.");
        return;
    }

    const targetSlot = schedules.find(s => s.id === slotId);
    if (targetSlot) {
        let currentVolunteers = targetSlot.volunteer_names 
            ? targetSlot.volunteer_names.split(',').map(n => n.trim()).filter(n => n.length > 0)
            : [];

        if (currentVolunteers.length >= MAX_VOLUNTEERS_PER_SLOT) {
            alert(`This time slot has already reached the maximum limit of ${MAX_VOLUNTEERS_PER_SLOT} volunteers.`);
            return;
        }

        if (currentVolunteers.some(name => name.toLowerCase() === newVolunteerName.toLowerCase())) {
            alert("This name is already registered for this time slot.");
            return;
        }

        currentVolunteers.push(newVolunteerName);
        const updatedNames = currentVolunteers.join(', ');

        db.collection("schedules").doc(slotId.toString()).update({
            volunteer_names: updatedNames,
            status: 'Confirmed',
            last_updated: Date.now()
        }).then(() => {
            alert("Success! Your name has been added to the schedule shift.");
            closeVolunteerFormModal();
        }).catch((error) => {
            alert("Error updating schedule: " + error.message);
        });
    }
}

// --- ADMIN CRUD OPERATIONS ---
function openAdminModal() {
    if (currentRole !== 'admin') return;
    document.getElementById('adminModalTitle').textContent = "Add Schedule Slot";
    document.getElementById('adminScheduleForm').reset();
    document.getElementById('slotId').value = '';
    document.getElementById('adminCrudModal').style.display = 'flex';
}

function openEditAdminModal(id) {
    if (currentRole !== 'admin') return;
    const record = schedules.find(s => s.id === id);
    if (!record) return;

    document.getElementById('adminModalTitle').textContent = "Edit Schedule Slot";
    document.getElementById('slotId').value = record.id;
    document.getElementById('adminFacilitySelect').value = record.facility_id;
    document.getElementById('adminTimeSlotInput').value = record.time_slot;
    document.getElementById('adminVolunteerInput').value = record.volunteer_names;
    document.getElementById('adminStatusSelect').value = record.status;

    document.getElementById('adminCrudModal').style.display = 'flex';
}

function closeAdminModal() {
    document.getElementById('adminCrudModal').style.display = 'none';
}

function handleAdminFormSubmit(event) {
    event.preventDefault();
    if (currentRole !== 'admin') return;

    const id = document.getElementById('slotId').value;
    const facility_id = parseInt(document.getElementById('adminFacilitySelect').value);
    const time_slot = document.getElementById('adminTimeSlotInput').value.trim();
    const volunteer_names = document.getElementById('adminVolunteerInput').value.trim();
    const status = document.getElementById('adminStatusSelect').value;

    if (!time_slot) {
        alert("Validation Error: Time slot cannot be empty.");
        return;
    }
    if (status === 'Confirmed' && !volunteer_names) {
        alert("Validation Error: Confirmed records must contain volunteer names.");
        return;
    }

    let slotId = id ? parseInt(id) : (schedules.length > 0 ? Math.max(...schedules.map(s => s.id)) + 1 : 1);

    const slotData = {
        id: slotId,
        facility_id: facility_id,
        time_slot: time_slot,
        volunteer_names: volunteer_names,
        status: status,
        last_updated: status === 'Confirmed' ? Date.now() : null
    };

    db.collection("schedules").doc(slotId.toString()).set(slotData).then(() => {
        closeAdminModal();
    }).catch((error) => {
        alert("Error saving record: " + error.message);
    });
}

function deleteRecord(id) {
    if (currentRole !== 'admin') return;
    if (confirm("Are you sure you want to clear this volunteer assignment and set the slot back to Vacant?")) {
        db.collection("schedules").doc(id.toString()).update({
            volunteer_names: '',
            status: 'Vacant',
            last_updated: null
        }).catch((error) => {
            alert("Error clearing record: " + error.message);
        });
    }
}

// --- MOBILE-FRIENDLY WINDOW EVENT LISTENERS ---
window.addEventListener('click', function(event) {
    if (event.target.classList.contains('modal')) {
        if (event.target.id === 'volunteerFormModal') closeVolunteerFormModal();
        if (event.target.id === 'adminCrudModal') closeAdminModal();
        if (event.target.id === 'historyModal') closeHistoryModal();
    }
});

window.addEventListener('touchend', function(event) {
    if (event.target.classList.contains('modal')) {
        if (event.target.id === 'volunteerFormModal') closeVolunteerFormModal();
        if (event.target.id === 'adminCrudModal') closeAdminModal();
        if (event.target.id === 'historyModal') closeHistoryModal();
    }
});

// --- GLOBAL EXPORTS ---
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.togglePasswordVisibility = togglePasswordVisibility;
window.printDailySchedule = printDailySchedule;
window.openVolunteerFormModal = openVolunteerFormModal;
window.closeVolunteerFormModal = closeVolunteerFormModal;
window.submitVolunteerShift = submitVolunteerShift;
window.resetAllSchedules = resetAllSchedules;
window.openHistoryModal = openHistoryModal;
window.closeHistoryModal = closeHistoryModal;
window.fetchHistoryForSelectedDate = fetchHistoryForSelectedDate;
window.openAdminModal = openAdminModal;
window.openEditAdminModal = openEditAdminModal;
window.closeAdminModal = closeAdminModal;
window.handleAdminFormSubmit = handleAdminFormSubmit;
window.deleteRecord = deleteRecord;