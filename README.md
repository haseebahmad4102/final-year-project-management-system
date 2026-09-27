# Final Year Project (FYP) Management System

A web-based platform for academic institutions to coordinate and manage final year projects across Students, Supervisors, and Administrators.

---

## 🚀 Overview

The **Final Year Project (FYP) Management System** streamlines academic project workflows from initial proposal submission to final grading and evaluation. Built with a clean Vanilla JavaScript Single-Page Application (SPA) frontend and a lightweight PHP/MySQL REST API backend.

---

## 🌟 Key Features

### 👨‍🎓 Student Portal
- **Proposal Submission & History**: Submit project proposals with version tracking, rejection feedback, and resubmission logs.
- **Group Management**: Individual or group project modes (leader + members).
- **Milestones & Tasks**: Track phase deadlines, submit task deliverables, and upload attachments.
- **Progress Reports**: Submit periodic progress reports with supervisor review status.
- **Direct Messaging**: Communicate directly with assigned supervisor.

### 👨‍🏫 Supervisor Portal
- **Proposal Review**: Approve, reject, or request revisions on student project proposals.
- **Task & Milestone Tracking**: Create and assign tasks, review deliverables, and provide structured feedback.
- **Student Progress Monitoring**: Oversee project progress percentage, reports, and deadlines.
- **Evaluation & Grading**: Score student projects across proposal, presentation, implementation, and viva phases.

### ⚙️ Administrator Portal
- **User Management**: Add, update, and manage student and supervisor accounts.
- **Project Oversight**: Assign or reassign supervisors, oversee project approvals, and track status.
- **Audit Logging**: Comprehensive system audit logs tracking changes, logins, and status transitions.
- **Evaluation Result Sheets**: Generate and print official department FYP evaluation result sheets.

---

## 🛠️ Tech Stack

- **Frontend**: HTML5, Modern CSS3 (CSS Variables, Flexbox/Grid), Vanilla JavaScript (ES6+ SPA)
- **Backend**: PHP 7.4+ / PHP 8.x (REST API, PDO MySQL, Session-based authentication)
- **Database**: MySQL 5.7+ / MariaDB 10.3+
- **Server**: Apache (with `mod_rewrite` enabled) or PHP Built-in Server

---

## 📦 Getting Started

### Prerequisites
- PHP 7.4 or higher with `pdo_mysql` extension enabled
- MySQL 5.7+ or MariaDB 10.3+
- Apache Web Server (e.g. XAMPP, WampServer, or LAMP)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/fyp-management-system.git
   cd fyp-management-system
   ```

2. **Set up the Database**:
   - Open MySQL / phpMyAdmin.
   - Import the provided schema:
     ```bash
     mysql -u root -p < database.sql
     ```
   - This creates the `fyp_management` database and seeds default demonstration accounts.

3. **Configure Database Connection**:
   - By default, `api.php` connects to `localhost` with user `root` and an empty password (standard local XAMPP setup).
   - You can configure custom credentials via environment variables:
     - `DB_HOST`: Hostname (default: `localhost`)
     - `DB_NAME`: Database name (default: `fyp_management`)
     - `DB_USER`: Database username (default: `root`)
     - `DB_PASS`: Database password (default: `""`)

4. **Run the Application**:
   - Place the project folder into your web server document root (e.g., `htdocs/` for XAMPP).
   - Ensure Apache's `mod_rewrite` is enabled.
   - Navigate to `http://localhost/fyp-management-system/` in your browser.

---

## 🔑 Demo Credentials

The database comes pre-seeded with sample test accounts:

| Role | Email | Password |
|---|---|---|
| **Administrator** | `admin@example.com` | `admin123` |
| **Supervisor** | `supervisor@example.com` | `sup123` |
| **Student** | `student@example.com` | `stu123` |

*(Note: For security in production, always change default passwords and disable demo credential hints).*

---

## 📁 Directory Structure

```text
├── api.php             # Core PHP REST API & backend logic
├── database.sql        # Database schema and initial seed data
├── index.html          # Single-Page Application interface
├── script.js           # Frontend application state & UI logic
├── styles.css          # Design system, themes, and responsive layout
├── diagnose.html       # Diagnostic utility to verify API connectivity
├── .htaccess           # URL rewriting and upload limit configuration
├── .gitignore          # Excludes logs, uploaded files, and environment configs
└── uploads/            # Runtime directory for uploaded project/report files
```

---

## 🔒 Security Best Practices

- Change default passwords immediately upon deployment.
- Store sensitive configuration options in environment variables.
- Ensure the `uploads/` directory has proper write permissions and execution restrictions.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
