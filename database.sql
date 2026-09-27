CREATE DATABASE IF NOT EXISTS fyp_management;
USE fyp_management;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'supervisor', 'student') NOT NULL,
    rollNo VARCHAR(50),
    program VARCHAR(50),
    department VARCHAR(50),
    specialization VARCHAR(255),
    joinDate DATE NOT NULL
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    studentId VARCHAR(50),
    supervisorId VARCHAR(50),
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    submittedDate DATE NOT NULL,
    approvalDate DATE,
    description TEXT,
    technologies VARCHAR(255),
    category VARCHAR(100),
    progress INT DEFAULT 0,
    feedback TEXT,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedBy VARCHAR(50),
    FOREIGN KEY (studentId) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (supervisorId) REFERENCES users(id) ON DELETE SET NULL
);

-- Milestones table
CREATE TABLE IF NOT EXISTS milestones (
    id VARCHAR(50) PRIMARY KEY,
    projectId VARCHAR(50),
    title VARCHAR(255) NOT NULL,
    dueDate DATE NOT NULL,
    status ENUM('pending', 'in-progress', 'completed') DEFAULT 'pending',
    notes TEXT,
    displayOrder INT DEFAULT 0,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(50) PRIMARY KEY,
    fromId VARCHAR(50),
    toId VARCHAR(50),
    projectId VARCHAR(50),
    text TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (fromId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (toId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE SET NULL
);

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
    id VARCHAR(50) PRIMARY KEY,
    projectId VARCHAR(50),
    studentId VARCHAR(50),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    submittedDate DATE NOT NULL,
    status ENUM('pending', 'reviewed') DEFAULT 'pending',
    feedback TEXT,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedBy VARCHAR(50),
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (studentId) REFERENCES users(id) ON DELETE CASCADE
);

-- File uploads table (filesystem-based, supports all types up to 200MB)
CREATE TABLE IF NOT EXISTS file_uploads (
    id VARCHAR(50) PRIMARY KEY,
    entityType VARCHAR(20) NOT NULL,
    entityId VARCHAR(50) NOT NULL,
    originalName VARCHAR(255) NOT NULL,
    storedName VARCHAR(255) NOT NULL,
    mimeType VARCHAR(100),
    fileSize BIGINT DEFAULT 0,
    uploadedBy VARCHAR(50),
    uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_entity (entityType, entityId)
);

-- Audit log table (tracks every change)
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(50) PRIMARY KEY,
    userId VARCHAR(50),
    userName VARCHAR(100),
    entityType VARCHAR(20),
    entityId VARCHAR(50),
    action VARCHAR(50) NOT NULL,
    fieldName VARCHAR(100),
    oldValue TEXT,
    newValue TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_entity (entityType, entityId),
    INDEX idx_timestamp (timestamp)
);

-- Document versions table (stores history of proposal/report edits)
CREATE TABLE IF NOT EXISTS document_versions (
    id VARCHAR(50) PRIMARY KEY,
    entityType VARCHAR(20) NOT NULL,
    entityId VARCHAR(50) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    title VARCHAR(255),
    description TEXT,
    technologies VARCHAR(255),
    changedBy VARCHAR(50),
    changedByName VARCHAR(100),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_entity (entityType, entityId)
);

-- Seed Data
INSERT IGNORE INTO users (id, name, email, password, role, department, joinDate) VALUES
('admin1', 'System Administrator', 'admin@example.com', 'admin123', 'admin', 'Computer Science', '2024-01-01');

INSERT IGNORE INTO users (id, name, email, password, role, department, specialization, joinDate) VALUES
('sup1', 'Dr. Alex Morgan', 'supervisor@example.com', 'sup123', 'supervisor', 'Computer Science', 'Web Development, Cloud Computing', '2023-01-15'),
('sup2', 'Dr. Sarah Johnson', 'supervisor2@example.com', 'sup123', 'supervisor', 'Computer Science', 'AI, Machine Learning', '2023-06-01');

INSERT IGNORE INTO users (id, name, email, password, role, rollNo, program, joinDate) VALUES
('stu1', 'Jane Doe', 'student@example.com', 'stu123', 'student', '2024-CS-001', 'BS CS', '2024-09-01'),
('stu2', 'John Smith', 'student2@example.com', 'stu123', 'student', '2024-CS-002', 'BS CS', '2024-09-01');

INSERT IGNORE INTO projects (id, title, studentId, supervisorId, status, submittedDate, description, technologies, category, progress, approvalDate, feedback) VALUES
('proj1', 'Final Year Project Management System', 'stu1', 'sup1', 'approved', '2024-10-01', 'A web-based platform to manage all FYP activities within the university, including proposal submission, milestone tracking, report submission, and supervisor-student communication.', 'HTML, CSS, JavaScript, PHP, MySQL', 'Web Development', 65, '2024-10-10', 'Excellent proposal. Proceed with development phase.'),
('proj2', 'AI-Based Crop Disease Detection', 'stu2', 'sup2', 'pending', '2024-11-15', 'Using Convolutional Neural Networks (CNN) to detect and classify crop diseases from images, providing actionable insights for farmers to improve yield.', 'Python, TensorFlow, Flask, React', 'Machine Learning', 10, NULL, '');

INSERT IGNORE INTO milestones (id, projectId, title, dueDate, status, notes, displayOrder) VALUES
('ms1', 'proj1', 'Requirement Analysis', '2024-10-20', 'completed', 'Requirements gathered and documented. Stakeholder interviews completed.', 0),
('ms2', 'proj1', 'System Design', '2024-11-10', 'completed', 'UI mockups and DB schema finalized. ER diagram approved.', 1),
('ms3', 'proj1', 'Backend Development', '2024-12-15', 'in-progress', 'API endpoints being developed. Database integration done.', 2),
('ms4', 'proj1', 'Frontend Development', '2025-01-20', 'pending', '', 3),
('ms5', 'proj1', 'Testing & Deployment', '2025-02-28', 'pending', '', 4);

INSERT IGNORE INTO messages (id, fromId, toId, projectId, text, timestamp, is_read) VALUES
('msg1', 'sup1', 'stu1', 'proj1', 'Good progress on your proposal. Please start with the database design next.', '2024-10-11 09:30:00', 1),
('msg2', 'stu1', 'sup1', 'proj1', 'Thank you! I will share the ER diagram by Friday.', '2024-10-11 11:00:00', 1),
('msg3', 'sup1', 'stu1', 'proj1', 'Please also prepare a Gantt chart timeline for the upcoming milestones.', '2024-10-14 10:15:00', 0);

INSERT IGNORE INTO reports (id, projectId, studentId, title, description, submittedDate, status, feedback) VALUES
('rep1', 'proj1', 'stu1', 'Phase 1 Progress Report', 'Completed requirement gathering and system design phase. All stakeholders interviewed and requirements document finalized.', '2024-11-01', 'reviewed', 'Good work. Maintain this momentum and submit next phase on time.'),
('rep2', 'proj1', 'stu1', 'Phase 2 Progress Report', 'Backend API development 60% complete. Database integration done. Authentication module ready.', '2024-12-20', 'pending', '');

-- Seed initial audit log entries
INSERT IGNORE INTO audit_logs (id, userId, userName, entityType, entityId, action, fieldName, oldValue, newValue, timestamp) VALUES
('log1', 'stu1', 'Jane Doe', 'project', 'proj1', 'created', 'title', NULL, 'Final Year Project Management System', '2024-10-01 09:00:00'),
('log2', 'sup1', 'Dr. Alex Morgan', 'project', 'proj1', 'status_changed', 'status', 'pending', 'approved', '2024-10-10 14:00:00'),
('log3', 'sup1', 'Dr. Alex Morgan', 'project', 'proj1', 'feedback_added', 'feedback', NULL, 'Excellent proposal. Proceed with development phase.', '2024-10-10 14:00:00'),
('log4', 'stu1', 'Jane Doe', 'report', 'rep1', 'submitted', 'title', NULL, 'Phase 1 Progress Report', '2024-11-01 10:00:00'),
('log5', 'sup1', 'Dr. Alex Morgan', 'report', 'rep1', 'reviewed', 'status', 'pending', 'reviewed', '2024-11-05 11:00:00');

-- Seed initial document versions
INSERT IGNORE INTO document_versions (id, entityType, entityId, version, title, description, technologies, changedBy, changedByName, timestamp) VALUES
('dv1', 'project', 'proj1', 1, 'Final Year Project Management System', 'A web-based platform to manage all FYP activities within the university.', 'HTML, CSS, JavaScript, PHP, MySQL', 'stu1', 'Jane Doe', '2024-10-01 09:00:00');
