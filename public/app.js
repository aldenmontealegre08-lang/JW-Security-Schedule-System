// Firebase Configuration Setup
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
let currentRole = null; // 'admin' or 'user'

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// --- AUTOMATED 24-HOUR CLEANUP CHECKER (OPTIONAL BACKGROUND BACKUP) ---
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
        batch.commit().then(() => {
            console.log("Automated 24-hour schedule cleanup completed.");
        }).catch((error) => {
            console.error("Error executing auto-cleanup:", error);
        });
    }
}

// --- INITIALIZE & FETCH FROM FIRESTORE ---
function initDatabase() {
    db.collection("schedules").get().then((snapshot) => {
        if (snapshot.empty) {
            // Seed initial default time slots if database is empty
            const defaultSlots = [
                // Facility 1: Kingdom Hall Security
                { id: 1, facility_id: 1, time_slot: '12:00am - 6:00am', volunteer_names: '', status: 'Vacant', last_updated: null },
                { id: 2, facility_id: 1, time_slot: '6:00am - 9:00am', volunteer_names: '', status: 'Vacant', last_updated: null },
                { id: 3, facility_id: 1, time_slot: '9:00am - 12:00pm', volunteer_names: '', status: 'Vacant', last_updated: null },
                { id: 4, facility_id: 1, time_slot: '12:00pm - 3:00pm', volunteer_names: '', status: 'Vacant', last_updated: null },
                { id: 5, facility_id: 1, time_slot: '3:00pm - 6:00pm', volunteer_names: '', status: 'Vacant', last_updated: null },
                { id: 6, facility_id: 1, time_slot: '6:00pm - 9:00pm', volunteer_names: '', status: 'Vacant', last_updated: null },
                { id: 7, facility_id: 1, time_slot: '9:00pm - 11:59pm', volunteer_names: '', status: 'Vacant', last_updated: null },

                // Facility 2: Bunk House Security
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
        } else {
            listenToFirestore();
        }
    });
}

// Real-time listener so tables auto-update whenever data changes in Firebase
function listenToFirestore() {
    db.collection("schedules").onSnapshot((snapshot) => {
        checkAndAutoResetSchedules(snapshot);

        schedules = [];
        snapshot.forEach((doc) => {
            schedules.push(doc.data());
        });
        schedules.sort((a, b) => a.id - b.id);
        renderTables();
    });
}

// Run database setup on load
window.onload = function() {
    initDatabase();
};

// --- CREDENTIAL LOGIN & LOGOUT HANDLERS ---
function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('usernameInput').value.trim();
    const password = document.getElementById('passwordInput').value.trim();
    const errorMsg = document.getElementById('loginError');

    if (username === 'admin' && password === 'admin123') {
        currentRole = 'admin';
    } else if (username === 'user' && password === 'user123') {
        currentRole = 'user';
    } else {
        errorMsg.textContent = "Invalid username or password. Please try again.";
        errorMsg.style.display = 'block';
        return;
    }

    errorMsg.style.display = 'none';
    document.body.classList.remove('logged-out');
    document.body.classList.remove('role-admin', 'role-user');
    document.body.classList.add(`role-${currentRole}`);

    const indicator = document.getElementById('roleIndicator');
    if (currentRole === 'admin') {
        indicator.textContent = "Admin Mode";
        indicator.className = "role-badge admin";
    } else {
        indicator.textContent = "Volunteer Portal";
        indicator.className = "role-badge user";
    }

    renderTables();
}

function handleLogout() {
    currentRole = null;
    document.body.classList.add('logged-out');
    document.getElementById('loginForm').reset();
    document.getElementById('loginError').style.display = 'none';
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
        const volunteerDisplay = item.volunteer_names ? item.volunteer_names : '<span style="color: #94a3b8; font-style: italic;">Unassigned Slot</span>';

        row.innerHTML = `
            <td>${item.time_slot}</td>
            <td>${volunteerDisplay}</td>
            <td><span class="badge ${badgeClass}">${item.status}</span></td>
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

// --- MANUAL RESET ALL SCHEDULES (ADMIN ONLY) ---
function resetAllSchedules() {
    if (currentRole !== 'admin') {
        alert("Access Denied: Only administrators can perform a full schedule reset.");
        return;
    }

    const confirmReset = confirm("Are you sure you want to RESET ALL SCHEDULES?\n\nThis will clear all volunteer names and set every slot back to Vacant.");
    
    if (!confirmReset) return;

    db.collection("schedules").get().then((snapshot) => {
        const batch = db.batch();

        snapshot.forEach((doc) => {
            const docRef = db.collection("schedules").doc(doc.id);
            batch.update(docRef, {
                volunteer_names: '',
                status: 'Vacant',
                last_updated: null
            });
        });

        return batch.commit();
    }).then(() => {
        alert("All schedules have been successfully reset to Vacant!");
    }).catch((error) => {
        alert("Error resetting schedule database: " + error.message);
    });
}

// --- PRINT SCHEDULE FEATURE (ADMIN ONLY) ---
function printDailySchedule() {
    if (currentRole !== 'admin') {
        alert("Access Denied: Only administrators are authorized to print the schedule.");
        return;
    }

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    const kingdomHallSlots = schedules.filter(s => s.facility_id === 1);
    const bunkHouseSlots = schedules.filter(s => s.facility_id === 2);

    let htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>JW Security Roster - Master Schedule</title>
            <style>
                body { font-family: Arial, sans-serif; color: #1e293b; padding: 20px; }
                h2 { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-top: 30px; color: #0f172a; }
                h1 { margin-bottom: 5px; color: #0f172a; }
                p.date { color: #64748b; margin-top: 0; font-size: 14px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 25px; }
                th, td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; font-size: 14px; }
                th { background-color: #f1f5f9; color: #334155; }
                .unassigned { color: #94a3b8; font-style: italic; }
                @media print {
                    button { display: none; }
                }
            </style>
        </head>
        <body>
            <h1>JW Security Roster & Shift Sign-Up</h1>
            <p class="date">Master Schedule Report — Generated on ${new Date().toLocaleDateString()}</p>
            
            <h2>Kingdom Hall Security</h2>
            <table>
                <thead>
                    <tr>
                        <th style="width: 35%;">Time Slot</th>
                        <th style="width: 50%;">Volunteer/s</th>
                        <th style="width: 15%;">Status</th>
                    </tr>
                </thead>
                <tbody>
    `;

    kingdomHallSlots.forEach(slot => {
        const volunteers = slot.volunteer_names ? slot.volunteer_names : '<span class="unassigned">Unassigned Slot</span>';
        htmlContent += `
            <tr>
                <td><strong>${slot.time_slot}</strong></td>
                <td>${volunteers}</td>
                <td>${slot.status}</td>
            </tr>
        `;
    });

    htmlContent += `
                </tbody>
            </table>

            <h2>Bunk House Security</h2>
            <table>
                <thead>
                    <tr>
                        <th style="width: 35%;">Time Slot</th>
                        <th style="width: 50%;">Volunteer/s</th>
                        <th style="width: 15%;">Status</th>
                    </tr>
                </thead>
                <tbody>
    `;

    bunkHouseSlots.forEach(slot => {
        const volunteers = slot.volunteer_names ? slot.volunteer_names : '<span class="unassigned">Unassigned Slot</span>';
        htmlContent += `
            <tr>
                <td><strong>${slot.time_slot}</strong></td>
                <td>${volunteers}</td>
                <td>${slot.status}</td>
            </tr>
        `;
    });

    htmlContent += `
                </tbody>
            </table>
            
            <script>
                window.onload = function() {
                    window.print();
                }
            </script>
        </body>
        </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
}

// --- USER FORM SUBMISSION FEATURE ---
function openVolunteerFormModal() {
    const timeSlotSelect = document.getElementById('formTimeSlotSelect');
    timeSlotSelect.innerHTML = '';

    if (schedules.length === 0) {
        timeSlotSelect.innerHTML = '<option disabled selected>No time slots available</option>';
    } else {
        schedules.forEach(slot => {
            const facilityName = slot.facility_id === 1 ? 'Kingdom Hall' : 'Bunk House';
            const opt = document.createElement('option');
            opt.value = slot.id;
            opt.textContent = `${facilityName} — ${slot.time_slot}`;
            timeSlotSelect.appendChild(opt);
        });
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

        if (currentVolunteers.length >= 4) {
            alert("This time slot has already reached the maximum limit of 4 volunteers.");
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
    document.getElementById('adminModalTitle').textContent = "Add Schedule Slot";
    document.getElementById('adminScheduleForm').reset();
    document.getElementById('slotId').value = '';
    document.getElementById('adminCrudModal').style.display = 'flex';
}

function openEditAdminModal(id) {
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

window.onclick = function(event) {
    if (event.target === document.getElementById('volunteerFormModal')) closeVolunteerFormModal();
    if (event.target === document.getElementById('adminCrudModal')) closeAdminModal();
};