const { randomUUID } = require("crypto");
const { Department, Category, SlaRule } = require("../models");
const logger = require("../config/logger");

/**
 * 6 Departments covering a full college / hostel / corporate campus.
 * Staff are assigned to one of these to determine auto-assignment routing.
 */
const DEFAULT_DEPARTMENTS = [
  {
    name: "Facilities & Maintenance",
    description: "Civil works, plumbing, electrical, HVAC, housekeeping",
  },
  {
    name: "IT & Technology",
    description: "Network, hardware, software, AV, cybersecurity, portals",
  },
  {
    name: "Hostel & Housing",
    description: "Room allocation, hostel rules, inter-floor noise, warden",
  },
  {
    name: "Administration & Finance",
    description: "Fees, scholarships, documents, ID cards, campus rules",
  },
  {
    name: "Health & Wellness",
    description: "Medical center, mental health, gym, sports, cafeteria hygiene",
  },
  {
    name: "Security & Compliance",
    description: "Campus gates, guards, CCTV, lost-found, emergency response",
  },
];

/**
 * 30 categories across 6 departments.
 * "Other" is always the fallback for Gemini AI when no category matches.
 */
const DEFAULT_CATEGORIES = [
  // ── Facilities & Maintenance ──────────────────────────────────────────────
  {
    name: "Plumbing",
    department: "Facilities & Maintenance",
    description: "Taps, leaks, washroom fittings, drainage, water supply",
  },
  {
    name: "Electrical & Power",
    department: "Facilities & Maintenance",
    description: "Lights, switches, power outages, generator, sockets",
  },
  {
    name: "HVAC & Air Conditioning",
    department: "Facilities & Maintenance",
    description: "AC units, fans, ventilation, heating, exhaust",
  },
  {
    name: "Carpentry & Furniture",
    department: "Facilities & Maintenance",
    description: "Doors, windows, locks, desks, beds, chairs, almirahs",
  },
  {
    name: "Sanitation & Housekeeping",
    department: "Facilities & Maintenance",
    description: "Trash, sweeping, mopping, washroom cleaning, hygiene",
  },
  {
    name: "Pest & Rodent Control",
    department: "Facilities & Maintenance",
    description: "Insects, cockroaches, rodents, termites, pest spraying",
  },
  {
    name: "Civil & Structural",
    department: "Facilities & Maintenance",
    description: "Cracks in walls/floors, roof leaks, broken tiles, renovation",
  },

  // ── IT & Technology ───────────────────────────────────────────────────────
  {
    name: "Wi-Fi & Network",
    department: "IT & Technology",
    description: "Internet speed, Wi-Fi dead zones, connectivity drops, router",
  },
  {
    name: "Computer & Hardware",
    department: "IT & Technology",
    description: "Lab PCs, printers, monitors, keyboards, peripherals",
  },
  {
    name: "Account & Portal Access",
    department: "IT & Technology",
    description: "Password resets, login issues, email access, ERP portal",
  },
  {
    name: "Audio & Visual Equipment",
    department: "IT & Technology",
    description: "Projectors, microphones, speakers, classroom displays, cameras",
  },
  {
    name: "Software & Application",
    department: "IT & Technology",
    description: "Software crashes, license issues, app installation, updates",
  },
  {
    name: "Cybersecurity & Privacy",
    department: "IT & Technology",
    description: "Phishing, data breach suspicions, unauthorized access, virus",
  },

  // ── Hostel & Housing ──────────────────────────────────────────────────────
  {
    name: "Room Allocation",
    department: "Hostel & Housing",
    description: "Room change requests, allotment issues, roommate conflicts",
  },
  {
    name: "Hostel Rules & Warden",
    department: "Hostel & Housing",
    description: "Curfew, visitor policy, warden complaints, hostel notices",
  },
  {
    name: "Noise & Disturbance",
    department: "Hostel & Housing",
    description: "Loud music, late-night disturbances, inter-room disputes",
  },
  {
    name: "Laundry & Common Areas",
    department: "Hostel & Housing",
    description: "Washing machine, common room, TV room, terrace, corridors",
  },

  // ── Administration & Finance ──────────────────────────────────────────────
  {
    name: "Fees & Payments",
    department: "Administration & Finance",
    description: "Fee receipt, fine disputes, payment failed, refund request",
  },
  {
    name: "Scholarship & Financial Aid",
    department: "Administration & Finance",
    description: "Scholarship status, form submission, eligibility queries",
  },
  {
    name: "ID Cards & Documents",
    department: "Administration & Finance",
    description: "Student/staff ID, bonafide, NOC, migration, certificate",
  },
  {
    name: "Library & Academic Resources",
    department: "Administration & Finance",
    description: "Library card, book availability, fine, e-resource access",
  },
  {
    name: "Campus Rules & Discipline",
    department: "Administration & Finance",
    description: "Conduct notice, disciplinary action, attendance grievance",
  },

  // ── Health & Wellness ─────────────────────────────────────────────────────
  {
    name: "Medical Center",
    department: "Health & Wellness",
    description: "Doctor appointment, medicine, first aid, ambulance",
  },
  {
    name: "Mental Health & Counseling",
    department: "Health & Wellness",
    description: "Stress, anxiety, counselor appointment, peer support",
  },
  {
    name: "Cafeteria & Food Quality",
    department: "Health & Wellness",
    description: "Mess food, food hygiene, canteen pricing, diet needs",
  },
  {
    name: "Sports & Gymnasium",
    department: "Health & Wellness",
    description: "Gym equipment, sports ground, court booking, sports kit",
  },

  // ── Security & Compliance ─────────────────────────────────────────────────
  {
    name: "Campus Security",
    department: "Security & Compliance",
    description: "Gate access, security guard behaviour, CCTV, night patrol",
  },
  {
    name: "Theft & Lost Property",
    department: "Security & Compliance",
    description: "Stolen items, lost found desk, unauthorized entry reports",
  },
  {
    name: "Emergency & Safety",
    department: "Security & Compliance",
    description: "Fire alarm, accident, medical emergency, evacuation drills",
  },

  // ── Catch-all (always last) ───────────────────────────────────────────────
  {
    name: "Other",
    department: "Administration & Finance",
    description: "General or unclassified requests not matching any category above",
  },
];

async function ensureCategories() {
  try {
    const deptMap = new Map();

    // 1. Upsert departments
    for (const d of DEFAULT_DEPARTMENTS) {
      let dept = await Department.findOne({ where: { name: d.name } });
      if (!dept) {
        dept = await Department.create({
          id: randomUUID(),
          name: d.name,
          description: d.description,
        });
        logger.info(`[seed] Created department: ${d.name}`);
      }
      deptMap.set(d.name, dept.id);
    }

    // 2. Upsert categories
    for (const c of DEFAULT_CATEGORIES) {
      let cat = await Category.findOne({ where: { name: c.name } });
      const departmentId = deptMap.get(c.department);

      if (!cat) {
        cat = await Category.create({
          id: randomUUID(),
          name: c.name,
          description: c.description,
          departmentId,
        });
        logger.info(`[seed] Created category: ${c.name}`);
      } else if (!cat.departmentId && departmentId) {
        cat.departmentId = departmentId;
        await cat.save();
      }
    }

    logger.info(`[seed] Ensured ${DEFAULT_DEPARTMENTS.length} departments and ${DEFAULT_CATEGORIES.length} categories`);
  } catch (err) {
    logger.error(`[seed] Failed to ensure categories: ${err.message}`);
  }
}

// Allow running directly: node src/utils/ensureCategories.js
if (require.main === module) {
  const sequelize = require("../config/db");
  ensureCategories()
    .then(() => {
      console.log(`Seeded ${DEFAULT_DEPARTMENTS.length} departments, ${DEFAULT_CATEGORIES.length} categories.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { ensureCategories, DEFAULT_CATEGORIES, DEFAULT_DEPARTMENTS };
