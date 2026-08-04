// --- FIREBASE CONFIGURATION ---
// Replace these values with your actual Firebase project credentials from the console
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let schedules = [];
let currentRole = null; // 'admin' or 'user'

// --- REAL-TIME DATABASE LISTENER ---
// Automatically syncs schedule changes across devices in real-time
function initRealtimeDatabase() {
    db.collection("schedules").onSnapshot((snapshot) => {
        schedules = [];
        snapshot.forEach((doc) => {
            schedules.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort items by ID or time slot for neat table presentation
        schedules.sort((a, b) => a.numericId - b.numericId);
        renderTables();
    }, (error) => {
        console.error("Error fetching schedules: ", error);
    });
}

// Seed initial default records if database collection is completely empty
async function checkAndSeedDatabase() {
    const snapshot = await db.collection("schedules").get();
    if (snapshot.empty) {
        const defaultSlots = [
            { numericId: 1, facility_id: 1, time_slot: '6:00am - 9:00am', volunteer_names: '', status: 'Vacant' },
            { numericId: 2, facility_id: 1, time_slot: '9:00am - 12:00pm', volunteer_names: '', status: 'Vacant' },
            { numericId: 3, facility_id: 1, time_slot: '12:00pm - 3:00pm', volunteer_names: '', status: 'Vacant' },
            { numericId: 4, facility_id: 2, time_slot: '6:00am - 9:00am', volunteer_names: '', status: 'Vacant' },
            { numericId: 5, facility_id: 2, time_slot: '12:00am - 6:00am', volunteer_names: '', status: 'Vacant' }
        ];
        
        for (let slot of defaultSlots) {
            await db.collection("schedules").add(slot);
        }
    }
}

// Run database initialization on load
checkAndSeedDatabase();
initRealtimeDatabase();


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
                <button class="btn-icon edit" onclick="openEditAdminModal('${item.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon delete" onclick="deleteRecord('${item.id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;

        if (item.facility_id === 1) {
            khBody.appendChild(row);
        } else {
            bunkBody.appendChild(row);
        }
    });
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
            opt.textContent = `${facilityName} (${slot.time_slot})`;
            timeSlotSelect.appendChild(opt);
        });
    }

    document.getElementById('shiftSubmissionForm').reset();
    document.getElementById('volunteerFormModal').style.display = 'flex';
}

function closeVolunteerFormModal() {
    document.getElementById('volunteerFormModal').style.display = 'none';
}

async function submitVolunteerShift(event) {
    event.preventDefault();
    const newVolunteerName = document.getElementById('volunteerFullName').value.trim();
    const slotId = document.getElementById('formTimeSlotSelect').value;

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

        try {
            // Update cloud database directly
            await db.collection("schedules").doc(slotId).update({
                volunteer_names: updatedNames,
                status: 'Confirmed'
            });

            alert("Success! Your name has been added to the schedule shift.");
            closeVolunteerFormModal();
        } catch (error) {
            console.error("Error updating document: ", error);
            alert("Failed to submit schedule. Please try again.");
        }
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

async function handleAdminFormSubmit(event) {
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

    try {
        if (id) {
            // Update existing record in Firestore
            await db.collection("schedules").doc(id).update({
                facility_id,
                time_slot,
                volunteer_names,
                status
            });
        } else {
            // Create new record in Firestore
            const newNumericId = schedules.length > 0 ? Math.max(...schedules.map(s => s.numericId || 0)) + 1 : 1;
            await db.collection("schedules").add({
                numericId: newNumericId,
                facility_id,
                time_slot,
                volunteer_names,
                status
            });
        }

        closeAdminModal();
    } catch (error) {
        console.error("Error saving record: ", error);
        alert("Operation failed. Please check your permissions.");
    }
}

async function deleteRecord(id) {
    if (confirm("Are you sure you want to delete this slot?")) {
        try {
            await db.collection("schedules").doc(id).delete();
        } catch (error) {
            console.error("Error deleting document: ", error);
            alert("Failed to delete record.");
        }
    }
}

// Close modals on outside click
window.onclick = function(event) {
    if (event.target === document.getElementById('volunteerFormModal')) closeVolunteerFormModal();
    if (event.target === document.getElementById('adminCrudModal')) closeAdminModal();
}