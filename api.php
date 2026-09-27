<?php
// ====================== PHP UPLOAD CONFIG (runtime fallbacks) ======================
@ini_set('memory_limit', '512M');
@ini_set('max_execution_time', '300');
@ini_set('max_input_time', '300');

error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

function debug_log($msg) {
    file_put_contents('api_debug.log', date('[Y-m-d H:i:s] ') . $msg . PHP_EOL, FILE_APPEND);
}

// Internal errors are logged server-side; clients only ever see a generic
// message so SQL/stack details are never leaked over the wire.
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    debug_log("PHP Error [$errno]: $errstr in $errfile on line $errline");
    // Warnings/notices (e.g. a missing optional request field) are logged but must
    // not abort the request. Only genuine errors return a 500.
    $fatal = [E_ERROR, E_USER_ERROR, E_RECOVERABLE_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR];
    if (!in_array($errno, $fatal, true)) {
        return true; // handled; continue execution
    }
    if (!headers_sent()) {
        http_response_code(500);
        header("Content-Type: application/json; charset=UTF-8");
    }
    echo json_encode(["error" => "An internal server error occurred."]);
    exit;
});

set_exception_handler(function($e) {
    debug_log("Exception: " . $e->getMessage());
    if (!headers_sent()) {
        http_response_code(500);
        header("Content-Type: application/json; charset=UTF-8");
    }
    echo json_encode(["error" => "An internal server error occurred."]);
    exit;
});

// ====================== CORS + SESSION (must be first) ======================
// Same-origin only: reflect the Origin header just for our own host and allow
// credentials so the session cookie travels. A wildcard origin is invalid with
// credentials and would otherwise let any site make authenticated calls.
$scheme     = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$selfOrigin = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
$reqOrigin  = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($reqOrigin === $selfOrigin) {
    header("Access-Control-Allow-Origin: $reqOrigin");
    header("Access-Control-Allow-Credentials: true");
}
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");

// Secure session cookie before any session starts
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'httponly' => true,
    'samesite' => 'Lax',
    'secure'   => ($scheme === 'https'),
]);
session_start();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ====================== DATABASE CONFIG ======================
$host     = getenv('DB_HOST') ?: 'localhost';
$db_name  = getenv('DB_NAME') ?: 'fyp_management';
$username = getenv('DB_USER') ?: 'root';
$password = getenv('DB_PASS') !== false ? getenv('DB_PASS') : '';

try {
    if (!extension_loaded('pdo_mysql')) throw new Exception("PDO MySQL extension not enabled.");

    $conn = new PDO("mysql:host=$host", $username, $password);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $conn->exec("CREATE DATABASE IF NOT EXISTS `$db_name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    $conn = new PDO("mysql:host=$host;dbname=$db_name;charset=utf8mb4", $username, $password);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $conn->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    debug_log("DB connected");
} catch (Exception $e) {
    debug_log("DB Error: " . $e->getMessage());
    header("Content-Type: application/json; charset=UTF-8");
    http_response_code(500);
    echo json_encode(["error" => "Database connection failed: " . $e->getMessage()]);
    exit;
}

// ====================== HELPER FUNCTIONS ======================
define('MAX_GROUP_SIZE', 4); // leader + up to 3 members

function generateId($prefix = '') {
    return $prefix . round(microtime(true) * 1000) . rand(100, 999);
}

function ensureColumn($conn, $table, $column, $definition) {
    $stmt = $conn->prepare("SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?");
    $stmt->execute([$table, $column]);
    if ((int)$stmt->fetchColumn() === 0) {
        $conn->exec("ALTER TABLE `$table` ADD COLUMN `$column` $definition");
    }
}

function logAudit($conn, $userId, $userName, $entityType, $entityId, $action, $fieldName = null, $oldValue = null, $newValue = null) {
    try {
        $id = generateId('log');
        $stmt = $conn->prepare("INSERT INTO audit_logs (id, userId, userName, entityType, entityId, action, fieldName, oldValue, newValue) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$id, $userId, $userName, $entityType, $entityId, $action, $fieldName,
            is_array($oldValue) ? json_encode($oldValue) : (string)($oldValue ?? ''),
            is_array($newValue) ? json_encode($newValue) : (string)($newValue ?? '')]);
    } catch (Exception $e) {
        debug_log("Audit log error: " . $e->getMessage());
    }
}

function saveDocumentVersion($conn, $entityType, $entityId, $title, $description, $technologies, $changedBy, $changedByName) {
    $stmt = $conn->prepare("SELECT MAX(version) FROM document_versions WHERE entityType = ? AND entityId = ?");
    $stmt->execute([$entityType, $entityId]);
    $maxVersion = (int)$stmt->fetchColumn();
    $id = generateId('dv');
    $stmt = $conn->prepare("INSERT INTO document_versions (id, entityType, entityId, version, title, description, technologies, changedBy, changedByName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([$id, $entityType, $entityId, $maxVersion + 1, $title, $description, $technologies, $changedBy, $changedByName]);
}

// ====================== AUTH / AUTHORIZATION HELPERS ======================
function currentUser() {
    return $_SESSION['user'] ?? null;
}

function jsonError($code, $msg) {
    http_response_code($code);
    echo json_encode(["error" => $msg]);
    exit;
}

// Load a project row (or null).
function loadProject($conn, $projectId) {
    if (!$projectId) return null;
    $s = $conn->prepare("SELECT * FROM projects WHERE id = ?");
    $s->execute([$projectId]);
    return $s->fetch() ?: null;
}

// Is this student a member (incl. leader) of the project's group?
function isProjectMember($conn, $studentId, $projectId) {
    if (!$studentId || !$projectId) return false;
    $s = $conn->prepare("SELECT 1 FROM project_members WHERE projectId=? AND studentId=? LIMIT 1");
    $s->execute([$projectId, $studentId]);
    return (bool)$s->fetchColumn();
}

// Horizontal access control: a user may only touch a project they belong to
// (student group member), supervise (supervisor), or anything (admin).
function assertProjectAccess($conn, $user, $projectId) {
    if (!$user) jsonError(401, 'Authentication required.');
    if ($user['role'] === 'admin') return;
    $p = loadProject($conn, $projectId);
    if (!$p) jsonError(404, 'Project not found.');
    if ($user['role'] === 'supervisor' && $p['supervisorId'] === $user['id']) return;
    if ($user['role'] === 'student' && (isProjectMember($conn, $user['id'], $projectId) || $p['studentId'] === $user['id'])) return;
    jsonError(403, 'You do not have access to this project.');
}

// Resolve the owning projectId for a child row (milestone/task/report).
function projectIdOf($conn, $table, $id) {
    if (!in_array($table, ['milestones','tasks','reports','meetings','evaluations'], true) || !$id) return null;
    $s = $conn->prepare("SELECT projectId FROM `$table` WHERE id = ?");
    $s->execute([$id]);
    return $s->fetchColumn() ?: null;
}

// A student may only act on a task assigned to them; supervisors/admins need
// access to the task's project.
function assertTaskAccess($conn, $user, $taskId) {
    if (!$user) jsonError(401, 'Authentication required.');
    $s = $conn->prepare("SELECT projectId, assignedTo FROM tasks WHERE id = ?");
    $s->execute([$taskId]);
    $t = $s->fetch();
    if (!$t) jsonError(404, 'Task not found.');
    if ($user['role'] === 'student') {
        if ($t['assignedTo'] !== $user['id']) jsonError(403, 'This task is not assigned to you.');
        return;
    }
    assertProjectAccess($conn, $user, $t['projectId']);
}

// ====================== ENSURE TABLES ======================
$conn->exec("CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin','supervisor','student') NOT NULL,
    rollNo VARCHAR(50), program VARCHAR(50), department VARCHAR(50), specialization VARCHAR(255),
    joinDate DATE NOT NULL
)");

$conn->exec("CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    studentId VARCHAR(50), supervisorId VARCHAR(50),
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    submittedDate DATE NOT NULL, approvalDate DATE,
    description TEXT, technologies VARCHAR(255), category VARCHAR(100),
    progress INT DEFAULT 0, feedback TEXT,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedBy VARCHAR(50),
    FOREIGN KEY (studentId) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (supervisorId) REFERENCES users(id) ON DELETE SET NULL
)");

$conn->exec("CREATE TABLE IF NOT EXISTS milestones (
    id VARCHAR(50) PRIMARY KEY,
    projectId VARCHAR(50),
    title VARCHAR(255) NOT NULL, dueDate DATE NOT NULL,
    status ENUM('pending','in-progress','completed') DEFAULT 'pending',
    notes TEXT, displayOrder INT DEFAULT 0,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
)");

$conn->exec("CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(50) PRIMARY KEY,
    fromId VARCHAR(50), toId VARCHAR(50), projectId VARCHAR(50),
    text TEXT NOT NULL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, is_read BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (fromId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (toId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE SET NULL
)");

$conn->exec("CREATE TABLE IF NOT EXISTS reports (
    id VARCHAR(50) PRIMARY KEY,
    projectId VARCHAR(50), studentId VARCHAR(50),
    title VARCHAR(255) NOT NULL, description TEXT,
    submittedDate DATE NOT NULL,
    status ENUM('pending','reviewed') DEFAULT 'pending',
    feedback TEXT,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updatedBy VARCHAR(50),
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (studentId) REFERENCES users(id) ON DELETE CASCADE
)");

$conn->exec("CREATE TABLE IF NOT EXISTS file_uploads (
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
)");

$conn->exec("CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(50) PRIMARY KEY,
    userId VARCHAR(50), userName VARCHAR(100),
    entityType VARCHAR(20), entityId VARCHAR(50),
    action VARCHAR(50) NOT NULL,
    fieldName VARCHAR(100), oldValue TEXT, newValue TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_entity (entityType, entityId),
    INDEX idx_ts (timestamp)
)");

$conn->exec("CREATE TABLE IF NOT EXISTS document_versions (
    id VARCHAR(50) PRIMARY KEY,
    entityType VARCHAR(20) NOT NULL, entityId VARCHAR(50) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    title VARCHAR(255), description TEXT, technologies VARCHAR(255),
    changedBy VARCHAR(50), changedByName VARCHAR(100),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_entity (entityType, entityId)
)");

$conn->exec("CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(50) PRIMARY KEY,
    projectId VARCHAR(50) NOT NULL,
    milestoneId VARCHAR(50),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assignedTo VARCHAR(50),
    assignedBy VARCHAR(50),
    assignedByName VARCHAR(100),
    priority ENUM('low','medium','high','urgent') DEFAULT 'medium',
    status ENUM('pending','in-progress','submitted','returned','completed') DEFAULT 'pending',
    dueDate DATE NOT NULL,
    completedDate DATE,
    studentNotes TEXT,
    supervisorFeedback TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_project (projectId),
    INDEX idx_student (assignedTo)
)");

$conn->exec("CREATE TABLE IF NOT EXISTS announcements (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    authorId VARCHAR(50),
    authorName VARCHAR(100),
    targetRole ENUM('all','student','supervisor') DEFAULT 'all',
    priority ENUM('normal','important','urgent') DEFAULT 'normal',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_target (targetRole)
)");

$conn->exec("CREATE TABLE IF NOT EXISTS meetings (
    id VARCHAR(50) PRIMARY KEY,
    projectId VARCHAR(50),
    supervisorId VARCHAR(50),
    studentId VARCHAR(50),
    title VARCHAR(255) NOT NULL,
    agenda TEXT,
    scheduledAt DATETIME NOT NULL,
    location VARCHAR(255),
    meetingType ENUM('weekly','proposal','review','midterm','viva','other') DEFAULT 'weekly',
    status ENUM('scheduled','completed','cancelled') DEFAULT 'scheduled',
    minutesNotes TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_project (projectId),
    INDEX idx_student (studentId),
    INDEX idx_supervisor (supervisorId)
)");

$conn->exec("CREATE TABLE IF NOT EXISTS evaluations (
    id VARCHAR(50) PRIMARY KEY,
    projectId VARCHAR(50) NOT NULL,
    evaluatorId VARCHAR(50),
    evaluatorName VARCHAR(100),
    evaluatorRole VARCHAR(20) DEFAULT 'supervisor',
    phase ENUM('fyp1','fyp2') DEFAULT 'fyp1',
    proposalMarks DECIMAL(5,2) DEFAULT 0,
    presentationMarks DECIMAL(5,2) DEFAULT 0,
    implementationMarks DECIMAL(5,2) DEFAULT 0,
    vivaMarks DECIMAL(5,2) DEFAULT 0,
    totalMarks DECIMAL(5,2) DEFAULT 0,
    grade VARCHAR(5),
    remarks TEXT,
    evaluatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_project (projectId)
)");

$conn->exec("CREATE TABLE IF NOT EXISTS supervisor_requests (
    id VARCHAR(50) PRIMARY KEY,
    studentId VARCHAR(50),
    studentName VARCHAR(100),
    studentRoll VARCHAR(50),
    supervisorId VARCHAR(50),
    proposalTitle VARCHAR(255),
    proposalSummary TEXT,
    status ENUM('pending','accepted','rejected') DEFAULT 'pending',
    supervisorResponse TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    respondedAt DATETIME,
    INDEX idx_supervisor (supervisorId),
    INDEX idx_student (studentId)
)");

$conn->exec("CREATE TABLE IF NOT EXISTS deadlines (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    dueDate DATE NOT NULL,
    phase VARCHAR(10) DEFAULT 'all',
    category VARCHAR(30) DEFAULT 'other',
    program VARCHAR(50) DEFAULT 'all',
    createdBy VARCHAR(50),
    createdByName VARCHAR(100),
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_due (dueDate)
)");

$conn->exec("CREATE TABLE IF NOT EXISTS project_members (
    id VARCHAR(50) PRIMARY KEY,
    projectId VARCHAR(50) NOT NULL,
    studentId VARCHAR(50) NOT NULL,
    isLeader BOOLEAN DEFAULT 0,
    joinedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_member (projectId, studentId),
    INDEX idx_proj (projectId),
    INDEX idx_stu (studentId)
)");

$conn->exec("CREATE TABLE IF NOT EXISTS proposal_submissions (
    id VARCHAR(50) PRIMARY KEY,
    projectId VARCHAR(50) NOT NULL,
    attempt INT NOT NULL DEFAULT 1,
    title VARCHAR(255),
    description TEXT,
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    feedback TEXT,
    submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewedAt DATETIME,
    INDEX idx_proj (projectId)
)");

// Backfill: record a first submission attempt for any existing project.
$conn->exec("INSERT IGNORE INTO proposal_submissions (id, projectId, attempt, title, description, status, feedback, submittedAt)
             SELECT CONCAT('ps', p.id), p.id, 1, p.title, p.description, p.status, p.feedback, p.submittedDate
             FROM projects p
             WHERE NOT EXISTS (SELECT 1 FROM proposal_submissions s WHERE s.projectId = p.id)");

// Backfill: every existing project's studentId becomes its group leader.
$conn->exec("INSERT IGNORE INTO project_members (id, projectId, studentId, isLeader)
             SELECT CONCAT('pm', p.id), p.id, p.studentId, 1
             FROM projects p WHERE p.studentId IS NOT NULL AND p.studentId <> ''");

$conn->exec("CREATE TABLE IF NOT EXISTS login_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    ip VARCHAR(64),
    success BOOLEAN DEFAULT FALSE,
    attemptedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email_time (email, attemptedAt)
)");

// Legacy column compatibility
ensureColumn($conn, 'milestones', 'displayOrder', 'INT DEFAULT 0');
ensureColumn($conn, 'milestones', 'updatedAt', 'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
ensureColumn($conn, 'milestones', 'description', 'TEXT');
ensureColumn($conn, 'milestones', 'createdBy', 'VARCHAR(50) DEFAULT NULL');
ensureColumn($conn, 'milestones', 'createdByName', 'VARCHAR(100) DEFAULT NULL');
ensureColumn($conn, 'projects',  'updatedAt',  'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
ensureColumn($conn, 'projects',  'updatedBy',  'VARCHAR(50) DEFAULT NULL');
ensureColumn($conn, 'projects',  'githubUrl',  'VARCHAR(500) DEFAULT NULL');
ensureColumn($conn, 'projects',  'demoUrl',    'VARCHAR(500) DEFAULT NULL');
ensureColumn($conn, 'projects',  'phase',      "VARCHAR(10) DEFAULT 'fyp1'");
ensureColumn($conn, 'reports',   'updatedAt',  'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
ensureColumn($conn, 'reports',   'updatedBy',  'VARCHAR(50) DEFAULT NULL');
ensureColumn($conn, 'tasks',     'supervisorFeedback', 'TEXT');
ensureColumn($conn, 'evaluations', 'evaluatorRole', "VARCHAR(20) DEFAULT 'supervisor'");

// Extend the task status enum for the submission/review loop (idempotent).
$taskStatusCol = $conn->query("SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tasks' AND COLUMN_NAME='status'")->fetchColumn();
if ($taskStatusCol && strpos($taskStatusCol, 'submitted') === false) {
    $conn->exec("ALTER TABLE tasks MODIFY status ENUM('pending','in-progress','submitted','returned','completed') DEFAULT 'pending'");
}

// Create uploads directory
$uploadsDir = __DIR__ . '/uploads/';
if (!is_dir($uploadsDir)) mkdir($uploadsDir, 0755, true);

// ====================== API ROUTING ======================
$method       = $_SERVER['REQUEST_METHOD'];
$action_param = $_GET['action'] ?? '';
$request      = explode('/', trim($action_param, '/'));
$mainAction   = $request[0] ?? '';
$subAction    = $request[1] ?? '';

// ====================== FILE DOWNLOAD (before JSON Content-Type header) ======================
if ($mainAction === 'files' && $subAction === 'download') {
    if (!currentUser()) { http_response_code(401); echo "Authentication required"; exit; }
    $fileId = $_GET['fileId'] ?? '';
    if (!$fileId) { http_response_code(400); echo "Missing fileId"; exit; }

    $stmt = $conn->prepare("SELECT * FROM file_uploads WHERE id = ?");
    $stmt->execute([$fileId]);
    $fr = $stmt->fetch();
    if (!$fr) { http_response_code(404); echo "File not found"; exit; }

    // Project-scoped files: enforce ownership.
    if ($fr['entityType'] === 'project') {
        assertProjectAccess($conn, currentUser(), $fr['entityId']);
    } elseif ($fr['entityType'] === 'task') {
        assertProjectAccess($conn, currentUser(), projectIdOf($conn, 'tasks', $fr['entityId']));
    }

    $filePath = $uploadsDir . $fr['entityType'] . '/' . $fr['storedName'];
    if (!file_exists($filePath)) { http_response_code(404); echo "File missing on disk"; exit; }

    $mime = $fr['mimeType'] ?: 'application/octet-stream';
    header('Content-Type: ' . $mime);
    header('Content-Disposition: attachment; filename="' . addslashes($fr['originalName']) . '"');
    header('Content-Length: ' . filesize($filePath));
    header('Cache-Control: no-cache, no-store');
    readfile($filePath);
    exit;
}

// ====================== JSON HEADER ======================
header("Content-Type: application/json; charset=UTF-8");

// ====================== REQUEST DATA ======================
$data         = [];
$uploadedFile = null;

if ($method === 'POST') {
    $ct = $_SERVER['CONTENT_TYPE'] ?? '';
    if (strpos($ct, 'multipart/form-data') !== false) {
        $data = $_POST;
        if (!empty($_FILES['file'])) {
            $ferr = $_FILES['file']['error'];
            if ($ferr === UPLOAD_ERR_OK) {
                $uploadedFile = $_FILES['file'];
            } elseif ($ferr !== UPLOAD_ERR_NO_FILE) {
                $errMap = [
                    UPLOAD_ERR_INI_SIZE   => 'File exceeds server limit (200MB). Check php.ini or .htaccess.',
                    UPLOAD_ERR_FORM_SIZE  => 'File exceeds form size limit.',
                    UPLOAD_ERR_PARTIAL    => 'File only partially uploaded.',
                    UPLOAD_ERR_NO_TMP_DIR => 'Missing temporary directory.',
                    UPLOAD_ERR_CANT_WRITE => 'Cannot write file to disk.',
                    UPLOAD_ERR_EXTENSION  => 'Upload blocked by PHP extension.',
                ];
                echo json_encode(["error" => $errMap[$ferr] ?? "Upload error code: $ferr"]);
                exit;
            }
        }
    } else {
        $raw  = file_get_contents("php://input");
        $data = json_decode($raw, true) ?? [];
    }
}

// ====================== FILE UPLOAD HELPER ======================
function handleFileUpload($conn, $file, $entityType, $entityId, $uploadedBy) {
    global $uploadsDir;

    $maxSize = 200 * 1024 * 1024;
    if ($file['size'] > $maxSize) throw new Exception("File exceeds 200MB limit.");

    $allowed = ['pdf','doc','docx','xls','xlsx','ppt','pptx','png','jpg','jpeg','gif','svg','webp',
                'zip','rar','7z','tar','gz','txt','csv','json','xml','mp4','avi','mp3','html','htm','md'];
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if ($ext && !in_array($ext, $allowed)) throw new Exception("File type .$ext is not allowed.");

    $fileId     = generateId('file');
    $storedName = $fileId . ($ext ? '.' . $ext : '');
    $subDir     = $uploadsDir . $entityType . '/';
    if (!is_dir($subDir)) mkdir($subDir, 0755, true);

    if (!move_uploaded_file($file['tmp_name'], $subDir . $storedName)) {
        throw new Exception("Failed to save file. Check directory permissions.");
    }

    $stmt = $conn->prepare("INSERT INTO file_uploads (id, entityType, entityId, originalName, storedName, mimeType, fileSize, uploadedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([$fileId, $entityType, $entityId, $file['name'], $storedName,
                    $file['type'] ?: 'application/octet-stream', $file['size'], $uploadedBy]);

    return ['fileId' => $fileId, 'fileName' => $file['name'], 'fileSize' => $file['size']];
}

// Helper: get latest file for an entity
function getEntityFile($conn, $entityType, $entityId) {
    $stmt = $conn->prepare("SELECT * FROM file_uploads WHERE entityType = ? AND entityId = ? ORDER BY uploadedAt DESC LIMIT 1");
    $stmt->execute([$entityType, $entityId]);
    return $stmt->fetch() ?: null;
}

// ====================== AUTHORIZATION GATE ======================
// Public routes need no session. Everything else requires login and is gated
// by role. The permission key is the HTTP method for reads, or the subAction
// for writes (POST). Ownership (who owns *this* row) is enforced inside the
// handlers via assertProjectAccess().
$PUBLIC_ACTIONS = ['test', 'login', 'register', 'logout', 'session'];

$PERMISSIONS = [
    'users'               => ['GET' => ['admin','supervisor','student'], 'create' => ['admin'], 'delete' => ['admin'], 'update' => ['admin','supervisor','student'], 'changePassword' => ['admin','supervisor','student']],
    'projects'            => ['GET' => ['admin','supervisor','student'], 'create' => ['admin','student'], 'update' => ['admin','supervisor','student'], 'review' => ['admin','supervisor'], 'updateProgress' => ['admin','supervisor','student'], 'delete' => ['admin'], 'reassign' => ['admin'], 'addMember' => ['admin','student'], 'removeMember' => ['admin','student']],
    'project_members'     => ['GET' => ['admin','supervisor','student']],
    'proposal_submissions'=> ['GET' => ['admin','supervisor','student']],
    'milestones'          => ['GET' => ['admin','supervisor','student'], 'create' => ['admin','supervisor'], 'updateStatus' => ['admin','supervisor','student'], 'reorder' => ['admin','supervisor'], 'delete' => ['admin','supervisor']],
    'tasks'               => ['GET' => ['admin','supervisor','student'], 'create' => ['admin','supervisor'], 'updateStatus' => ['admin','supervisor','student'], 'updateNotes' => ['admin','supervisor','student'], 'submit' => ['admin','student'], 'review' => ['admin','supervisor'], 'upload' => ['admin','supervisor','student'], 'delete' => ['admin','supervisor']],
    'reports'             => ['GET' => ['admin','supervisor','student'], 'create' => ['admin','student'], 'review' => ['admin','supervisor']],
    'evaluations'         => ['GET' => ['admin','supervisor','student'], 'create' => ['admin','supervisor'], 'update' => ['admin','supervisor']],
    'meetings'            => ['GET' => ['admin','supervisor','student'], 'create' => ['admin','supervisor'], 'update' => ['admin','supervisor'], 'cancel' => ['admin','supervisor'], 'complete' => ['admin','supervisor'], 'updateNotes' => ['admin','supervisor']],
    'announcements'       => ['GET' => ['admin','supervisor','student'], 'create' => ['admin','supervisor'], 'delete' => ['admin']],
    'deadlines'           => ['GET' => ['admin','supervisor','student'], 'create' => ['admin'], 'update' => ['admin'], 'delete' => ['admin']],
    'messages'            => ['GET' => ['admin','supervisor','student'], 'create' => ['admin','supervisor','student']],
    'supervisor_requests' => ['GET' => ['admin','supervisor','student'], 'create' => ['admin','student'], 'respond' => ['admin','supervisor']],
    'audit_logs'          => ['GET' => ['admin','supervisor','student']],
    'document_versions'   => ['GET' => ['admin','supervisor','student']],
    'files'               => ['GET' => ['admin','supervisor','student'], 'list' => ['admin','supervisor','student']],
];

$ACTOR = currentUser();
if (!in_array($mainAction, $PUBLIC_ACTIONS, true)) {
    if (!$ACTOR) jsonError(401, 'Authentication required. Please log in.');
    $rules = $PERMISSIONS[$mainAction] ?? null;
    if ($rules === null) jsonError(404, 'Unknown endpoint.');
    $permKey = ($method === 'GET') ? 'GET' : ($subAction ?: 'POST');
    $allowedRoles = $rules[$permKey] ?? null;
    if ($allowedRoles === null) jsonError(405, 'Method not allowed for this endpoint.');
    if (!in_array($ACTOR['role'], $allowedRoles, true)) {
        jsonError(403, 'You do not have permission to perform this action.');
    }
    // Server-derived actor: the audit trail can never be forged by the client.
    if ($method === 'POST') {
        $data['actorId']   = $ACTOR['id'];
        $data['actorName'] = $ACTOR['name'];
    }
}

// ====================== MAIN SWITCH ======================
switch ($mainAction) {

    case 'test':
        echo json_encode(["status" => "ok", "message" => "API is working",
                          "upload_max_filesize" => ini_get('upload_max_filesize'),
                          "post_max_size" => ini_get('post_max_size')]);
        break;

    // ==================== LOGIN ====================
    case 'login':
        if ($method === 'POST') {
            $email    = $data['email']    ?? '';
            $password = $data['password'] ?? '';
            $role     = $data['role']     ?? '';
            if (!$email || !$password || !$role) {
                http_response_code(400);
                echo json_encode(["error" => "Email, password and role are required"]);
                exit;
            }

            // Brute-force throttle: max 5 failures per email in 15 minutes.
            $ip = $_SERVER['REMOTE_ADDR'] ?? '';
            $thr = $conn->prepare("SELECT COUNT(*) FROM login_attempts WHERE email = ? AND success = 0 AND attemptedAt > (NOW() - INTERVAL 15 MINUTE)");
            $thr->execute([$email]);
            if ((int)$thr->fetchColumn() >= 5) {
                http_response_code(429);
                echo json_encode(["error" => "Too many failed attempts. Please try again in 15 minutes."]);
                exit;
            }

            $stmt = $conn->prepare("SELECT id, name, email, role, rollNo, program, department, specialization, joinDate, password AS pwd
                                    FROM users WHERE email = ? AND role = ?");
            $stmt->execute([$email, $role]);
            $userData = $stmt->fetch();
            $authenticated = false;
            if ($userData) {
                $storedPwd = $userData['pwd'];
                unset($userData['pwd']);
                // Support bcrypt hashes (new) and legacy plaintext
                if (strlen($storedPwd) >= 60 && strpos($storedPwd, '$2y$') === 0) {
                    $authenticated = password_verify($password, $storedPwd);
                } else {
                    $authenticated = ($password === $storedPwd);
                    if ($authenticated) {
                        // Auto-upgrade legacy plaintext to bcrypt
                        $conn->prepare("UPDATE users SET password=? WHERE id=?")->execute([password_hash($password, PASSWORD_DEFAULT), $userData['id']]);
                    }
                }
            }

            // Record the attempt (for throttling).
            $conn->prepare("INSERT INTO login_attempts (email, ip, success) VALUES (?, ?, ?)")
                 ->execute([$email, $ip, $authenticated ? 1 : 0]);

            $user = $authenticated ? $userData : null;
            if ($user) {
                // Prevent session fixation, then bind identity to the session.
                session_regenerate_id(true);
                $_SESSION['user'] = $user;
                logAudit($conn, $user['id'], $user['name'], 'user', $user['id'], 'login');
                echo json_encode($user);
            } else {
                http_response_code(401);
                echo json_encode(["error" => "Invalid credentials or wrong role"]);
            }
        }
        break;

    // ==================== SESSION / CURRENT USER ====================
    case 'session':
        // Lets the SPA resume an existing session on page reload.
        if ($method === 'GET') {
            $u = currentUser();
            if ($u) { echo json_encode($u); }
            else    { http_response_code(401); echo json_encode(["error" => "Not authenticated"]); }
        }
        break;

    // ==================== LOGOUT ====================
    case 'logout':
        if ($method === 'POST') {
            $u = currentUser();
            if ($u) logAudit($conn, $u['id'], $u['name'], 'user', $u['id'], 'logout');
            $_SESSION = [];
            if (ini_get('session.use_cookies')) {
                $p = session_get_cookie_params();
                setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
            }
            session_destroy();
            echo json_encode(["success" => true]);
        }
        break;

    // ==================== REGISTER ====================
    case 'register':
        if ($method === 'POST') {
            $id = generateId('stu');
            $hashedPwd = password_hash($data['password'] ?? 'changeme123', PASSWORD_DEFAULT);
            $stmt = $conn->prepare("INSERT INTO users (id, name, email, password, role, rollNo, joinDate) VALUES (?, ?, ?, ?, 'student', ?, ?)");
            $stmt->execute([$id, $data['name'], $data['email'], $hashedPwd, $data['rollNo'], date('Y-m-d')]);
            logAudit($conn, $id, $data['name'], 'user', $id, 'registered', 'email', null, $data['email']);
            echo json_encode(["success" => true, "id" => $id]);
        }
        break;

    // ==================== USERS ====================
    case 'users':
        if ($method === 'GET') {
            $stmt = $conn->prepare("SELECT id, name, email, role, rollNo, program, department, specialization, joinDate FROM users");
            $stmt->execute();
            echo json_encode($stmt->fetchAll());
        } elseif ($method === 'POST') {
            if ($subAction === 'create') {
                $id       = $data['id'] ?? generateId($data['role'] === 'supervisor' ? 'sup' : 'stu');
                $actorId  = $data['actorId']   ?? 'admin';
                $actorName = $data['actorName'] ?? 'Admin';
                $hashedPwd = password_hash($data['password'] ?? 'changeme123', PASSWORD_DEFAULT);
                $stmt = $conn->prepare("INSERT INTO users (id, name, email, password, role, rollNo, department, specialization, joinDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$id, $data['name'], $data['email'], $hashedPwd, $data['role'],
                                $data['rollNo'] ?? null, $data['department'] ?? 'IT',
                                $data['specialization'] ?? null, $data['joinDate'] ?? date('Y-m-d')]);
                logAudit($conn, $actorId, $actorName, 'user', $id, 'created', 'role', null, $data['role'] . ':' . $data['name']);
                echo json_encode(["success" => true]);
            } elseif ($subAction === 'delete') {
                $actorId   = $data['actorId']   ?? 'admin';
                $actorName = $data['actorName'] ?? 'Admin';
                $stmt = $conn->prepare("SELECT name, role FROM users WHERE id = ?");
                $stmt->execute([$data['id']]);
                $del = $stmt->fetch();
                $stmt = $conn->prepare("DELETE FROM users WHERE id = ?");
                $stmt->execute([$data['id']]);
                if ($del) logAudit($conn, $actorId, $actorName, 'user', $data['id'], 'deleted', 'name', $del['name'], null);
                echo json_encode(["success" => true]);
            } elseif ($subAction === 'update') {
                // Self-service profile edit; admins may edit anyone (incl. role/email).
                $targetId = ($ACTOR['role'] === 'admin') ? ($data['id'] ?? $ACTOR['id']) : $ACTOR['id'];
                $cur = $conn->prepare("SELECT * FROM users WHERE id=?"); $cur->execute([$targetId]); $u = $cur->fetch();
                if (!$u) jsonError(404, 'User not found.');
                $name           = trim($data['name'] ?? $u['name']);
                $department     = $data['department'] ?? $u['department'];
                $specialization = $data['specialization'] ?? $u['specialization'];
                $program        = $data['program'] ?? $u['program'];
                if ($name === '') jsonError(400, 'Name is required.');
                if ($ACTOR['role'] === 'admin') {
                    // Admin may also change email and role.
                    $email = trim($data['email'] ?? $u['email']);
                    $role  = in_array(($data['role'] ?? $u['role']), ['admin','supervisor','student'], true) ? ($data['role'] ?? $u['role']) : $u['role'];
                    $stmt = $conn->prepare("UPDATE users SET name=?, email=?, role=?, department=?, specialization=?, program=? WHERE id=?");
                    $stmt->execute([$name, $email, $role, $department, $specialization, $program, $targetId]);
                } else {
                    $stmt = $conn->prepare("UPDATE users SET name=?, department=?, specialization=?, program=? WHERE id=?");
                    $stmt->execute([$name, $department, $specialization, $program, $targetId]);
                }
                logAudit($conn, $ACTOR['id'], $ACTOR['name'], 'user', $targetId, 'updated', 'name', $u['name'], $name);
                // Keep the live session fresh if you edited yourself.
                if ($targetId === $ACTOR['id']) { $_SESSION['user']['name'] = $name; }
                echo json_encode(["success" => true]);

            } elseif ($subAction === 'changePassword') {
                // Non-admins can only change their own password.
                $id          = ($ACTOR['role'] === 'admin') ? ($data['id'] ?? $ACTOR['id']) : $ACTOR['id'];
                $oldPassword = $data['oldPassword'] ?? '';
                $newPassword = $data['newPassword'] ?? '';
                if (!$id || !$oldPassword || !$newPassword) {
                    http_response_code(400); echo json_encode(["error" => "Missing required fields"]); exit;
                }
                if (strlen($newPassword) < 6) {
                    http_response_code(400); echo json_encode(["error" => "New password must be at least 6 characters"]); exit;
                }
                $stmt = $conn->prepare("SELECT password, name FROM users WHERE id = ?");
                $stmt->execute([$id]);
                $user = $stmt->fetch();
                $pwdOk = false;
                if ($user) {
                    $storedPwd = $user['password'];
                    if (strlen($storedPwd) >= 60 && strpos($storedPwd, '$2y$') === 0) {
                        $pwdOk = password_verify($oldPassword, $storedPwd);
                    } else {
                        $pwdOk = ($oldPassword === $storedPwd);
                    }
                }
                if (!$pwdOk) {
                    http_response_code(400); echo json_encode(["error" => "Current password is incorrect"]); exit;
                }
                $newHashed = password_hash($newPassword, PASSWORD_DEFAULT);
                $stmt = $conn->prepare("UPDATE users SET password = ? WHERE id = ?");
                $stmt->execute([$newHashed, $id]);
                logAudit($conn, $id, $user['name'], 'user', $id, 'password_changed');
                echo json_encode(["success" => true]);
            }
        }
        break;

    // ==================== PROJECTS ====================
    case 'projects':
        if ($method === 'GET') {
            // Join only the LATEST file per project (multiple uploads must not
            // duplicate the project row).
            $join = "SELECT p.*, fu.id as fileId, fu.originalName as fileName, fu.fileSize
                     FROM projects p
                     LEFT JOIN file_uploads fu ON fu.id = (SELECT id FROM file_uploads WHERE entityType='project' AND entityId=p.id ORDER BY uploadedAt DESC LIMIT 1)";
            // Scope to the caller: students see only their own projects, supervisors
            // only those they supervise; admins may query any/all.
            if ($ACTOR['role'] === 'student') {
                $stmt = $conn->prepare("$join WHERE p.id IN (SELECT projectId FROM project_members WHERE studentId = ?) ORDER BY p.submittedDate DESC");
                $stmt->execute([$ACTOR['id']]);
            } elseif ($ACTOR['role'] === 'supervisor') {
                $stmt = $conn->prepare("$join WHERE p.supervisorId = ? ORDER BY p.submittedDate DESC");
                $stmt->execute([$ACTOR['id']]);
            } elseif (!empty($_GET['studentId'])) {
                $stmt = $conn->prepare("$join WHERE p.studentId = ? ORDER BY p.submittedDate DESC");
                $stmt->execute([$_GET['studentId']]);
            } elseif (!empty($_GET['supervisorId'])) {
                $stmt = $conn->prepare("$join WHERE p.supervisorId = ? ORDER BY p.submittedDate DESC");
                $stmt->execute([$_GET['supervisorId']]);
            } else {
                $stmt = $conn->prepare("$join ORDER BY p.submittedDate DESC");
                $stmt->execute();
            }
            echo json_encode($stmt->fetchAll());

        } elseif ($method === 'POST') {
            if ($subAction === 'create') {
                $id        = $data['id'] ?? generateId('proj');
                // A student can only file a proposal for themselves.
                $studentId = ($ACTOR['role'] === 'student') ? $ACTOR['id'] : ($data['studentId'] ?? '');
                $actorName = $data['studentName'] ?? $ACTOR['name'];

                $stmt = $conn->prepare("INSERT INTO projects (id, title, studentId, supervisorId, status, submittedDate, description, technologies, category, progress, feedback, updatedBy, githubUrl, demoUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$id, $data['title'], $studentId, $data['supervisorId'],
                                $data['status'] ?? 'pending', $data['submittedDate'],
                                $data['description'], $data['technologies'], $data['category'],
                                $data['progress'] ?? 0, $data['feedback'] ?? '', $studentId,
                                $data['githubUrl'] ?? null, $data['demoUrl'] ?? null]);

                // The creator is the group leader (a 1-member "individual" project to start).
                $conn->prepare("INSERT IGNORE INTO project_members (id, projectId, studentId, isLeader) VALUES (?, ?, ?, 1)")
                     ->execute([generateId('pm'), $id, $studentId]);

                // Record the first submission attempt.
                $conn->prepare("INSERT INTO proposal_submissions (id, projectId, attempt, title, description, status) VALUES (?, ?, 1, ?, ?, ?)")
                     ->execute([generateId('ps'), $id, $data['title'], $data['description'], $data['status'] ?? 'pending']);

                if ($uploadedFile) {
                    try { handleFileUpload($conn, $uploadedFile, 'project', $id, $studentId); }
                    catch (Exception $e) { debug_log("File upload: " . $e->getMessage()); }
                }

                saveDocumentVersion($conn, 'project', $id, $data['title'], $data['description'], $data['technologies'] ?? '', $studentId, $actorName);
                logAudit($conn, $studentId, $actorName, 'project', $id, 'created', 'title', null, $data['title']);
                echo json_encode(["success" => true, "id" => $id]);

            } elseif ($subAction === 'addMember') {
                $projectId    = $data['projectId'] ?? '';
                $newStudentId = $data['studentId'] ?? '';
                $proj = loadProject($conn, $projectId);
                if (!$proj) jsonError(404, 'Project not found.');
                // Only the group leader or an admin may add members.
                if ($ACTOR['role'] !== 'admin' && $proj['studentId'] !== $ACTOR['id']) jsonError(403, 'Only the group leader can add members.');
                if (!$newStudentId) jsonError(400, 'A student is required.');
                $u = $conn->prepare("SELECT id, name, role FROM users WHERE id=?"); $u->execute([$newStudentId]);
                $target = $u->fetch();
                if (!$target || $target['role'] !== 'student') jsonError(400, 'Selected user is not a student.');
                // One group per student.
                $chk = $conn->prepare("SELECT 1 FROM project_members WHERE studentId=? LIMIT 1"); $chk->execute([$newStudentId]);
                if ($chk->fetchColumn()) jsonError(409, 'That student is already in a project group.');
                // Enforce maximum group size.
                $cnt = $conn->prepare("SELECT COUNT(*) FROM project_members WHERE projectId=?"); $cnt->execute([$projectId]);
                if ((int)$cnt->fetchColumn() >= MAX_GROUP_SIZE) jsonError(409, 'Group is full (max ' . MAX_GROUP_SIZE . ' members).');
                $conn->prepare("INSERT IGNORE INTO project_members (id, projectId, studentId, isLeader) VALUES (?, ?, ?, 0)")
                     ->execute([generateId('pm'), $projectId, $newStudentId]);
                logAudit($conn, $ACTOR['id'], $ACTOR['name'], 'project', $projectId, 'member_added', 'member', null, $target['name']);
                echo json_encode(["success" => true]);

            } elseif ($subAction === 'removeMember') {
                $projectId   = $data['projectId'] ?? '';
                $rmStudentId = $data['studentId'] ?? '';
                $proj = loadProject($conn, $projectId);
                if (!$proj) jsonError(404, 'Project not found.');
                if ($ACTOR['role'] !== 'admin' && $proj['studentId'] !== $ACTOR['id']) jsonError(403, 'Only the group leader can remove members.');
                $lead = $conn->prepare("SELECT isLeader FROM project_members WHERE projectId=? AND studentId=?");
                $lead->execute([$projectId, $rmStudentId]);
                $row = $lead->fetch();
                if (!$row) jsonError(404, 'Member not found in this group.');
                if ((int)$row['isLeader'] === 1) jsonError(400, 'The group leader cannot be removed.');
                $conn->prepare("DELETE FROM project_members WHERE projectId=? AND studentId=? AND isLeader=0")->execute([$projectId, $rmStudentId]);
                // Unassign any of their tasks on this project.
                $conn->prepare("UPDATE tasks SET assignedTo=NULL WHERE projectId=? AND assignedTo=?")->execute([$projectId, $rmStudentId]);
                logAudit($conn, $ACTOR['id'], $ACTOR['name'], 'project', $projectId, 'member_removed', 'member', $rmStudentId, null);
                echo json_encode(["success" => true]);

            } elseif ($subAction === 'updateProgress') {
                assertProjectAccess($conn, $ACTOR, $data['id'] ?? '');
                $actorId   = $data['actorId']   ?? '';
                $actorName = $data['actorName'] ?? 'Student';
                $stmt = $conn->prepare("SELECT progress FROM projects WHERE id = ?");
                $stmt->execute([$data['id']]);
                $old = $stmt->fetch();
                $stmt = $conn->prepare("UPDATE projects SET progress = ?, updatedBy = ?, updatedAt = NOW() WHERE id = ?");
                $stmt->execute([$data['progress'], $actorId, $data['id']]);
                logAudit($conn, $actorId, $actorName, 'project', $data['id'], 'progress_updated', 'progress', $old['progress'] ?? 0, $data['progress']);
                echo json_encode(["success" => true]);

            } elseif ($subAction === 'review') {
                assertProjectAccess($conn, $ACTOR, $data['id'] ?? '');
                $actorId   = $data['actorId']   ?? '';
                $actorName = $data['actorName'] ?? 'Supervisor';
                $stmt = $conn->prepare("SELECT status, feedback FROM projects WHERE id = ?");
                $stmt->execute([$data['id']]);
                $old = $stmt->fetch();
                $stmt = $conn->prepare("UPDATE projects SET status = ?, feedback = ?, approvalDate = ?, updatedBy = ?, updatedAt = NOW() WHERE id = ?");
                $stmt->execute([$data['status'], $data['feedback'] ?? '', $data['approvalDate'] ?? null, $actorId, $data['id']]);
                logAudit($conn, $actorId, $actorName, 'project', $data['id'], 'status_changed', 'status', $old['status'] ?? '', $data['status']);
                // Record the decision against the latest submission attempt.
                $conn->prepare("UPDATE proposal_submissions SET status=?, feedback=?, reviewedAt=NOW() WHERE projectId=? ORDER BY attempt DESC LIMIT 1")
                     ->execute([$data['status'], $data['feedback'] ?? '', $data['id']]);
                if (($data['feedback'] ?? '') && ($data['feedback'] ?? '') !== ($old['feedback'] ?? '')) {
                    logAudit($conn, $actorId, $actorName, 'project', $data['id'], 'feedback_added', 'feedback', $old['feedback'] ?? '', $data['feedback']);
                }
                echo json_encode(["success" => true]);

            } elseif ($subAction === 'update') {
                assertProjectAccess($conn, $ACTOR, $data['id'] ?? '');
                $actorId   = $data['actorId']   ?? '';
                $actorName = $data['actorName'] ?? 'User';
                $stmt = $conn->prepare("SELECT title, description, technologies, category, status FROM projects WHERE id = ?");
                $stmt->execute([$data['id']]);
                $old = $stmt->fetch();

                // Editing a rejected proposal resubmits it for review (back to pending).
                $resubmitting = (($old['status'] ?? '') === 'rejected');

                $stmt = $conn->prepare("UPDATE projects SET title = ?, description = ?, technologies = ?, category = ?, githubUrl = ?, demoUrl = ?, updatedBy = ?, updatedAt = NOW() WHERE id = ?");
                $stmt->execute([$data['title'], $data['description'], $data['technologies'],
                                $data['category'] ?? ($old['category'] ?? ''),
                                $data['githubUrl'] ?? null, $data['demoUrl'] ?? null,
                                $actorId, $data['id']]);

                if ($resubmitting) {
                    $conn->prepare("UPDATE projects SET status='pending', feedback='', approvalDate=NULL WHERE id=?")->execute([$data['id']]);
                    logAudit($conn, $actorId, $actorName, 'project', $data['id'], 'status_changed', 'status', 'rejected', 'pending');
                    // Record this as a new submission attempt.
                    $nextAtt = (int)$conn->query("SELECT COALESCE(MAX(attempt),0)+1 FROM proposal_submissions WHERE projectId=" . $conn->quote($data['id']))->fetchColumn();
                    $conn->prepare("INSERT INTO proposal_submissions (id, projectId, attempt, title, description, status) VALUES (?, ?, ?, ?, ?, 'pending')")
                         ->execute([generateId('ps'), $data['id'], $nextAtt, $data['title'], $data['description']]);
                }

                if ($uploadedFile) {
                    try { handleFileUpload($conn, $uploadedFile, 'project', $data['id'], $actorId); }
                    catch (Exception $e) { debug_log("File upload: " . $e->getMessage()); }
                }

                saveDocumentVersion($conn, 'project', $data['id'], $data['title'], $data['description'], $data['technologies'] ?? '', $actorId, $actorName);

                foreach (['title', 'description', 'technologies'] as $f) {
                    if (isset($data[$f]) && ($old[$f] ?? '') !== $data[$f]) {
                        logAudit($conn, $actorId, $actorName, 'project', $data['id'], 'field_updated', $f, $old[$f] ?? '', $data[$f]);
                    }
                }
                echo json_encode(["success" => true]);

            } elseif ($subAction === 'reassign') {
                $actorId   = $data['actorId']   ?? '';
                $actorName = $data['actorName'] ?? 'Admin';
                $stmt = $conn->prepare("SELECT supervisorId FROM projects WHERE id = ?");
                $stmt->execute([$data['id']]);
                $old = $stmt->fetch();
                $stmt = $conn->prepare("UPDATE projects SET supervisorId = ?, updatedBy = ?, updatedAt = NOW() WHERE id = ?");
                $stmt->execute([$data['supervisorId'], $actorId, $data['id']]);
                logAudit($conn, $actorId, $actorName, 'project', $data['id'], 'reassigned', 'supervisorId', $old['supervisorId'] ?? '', $data['supervisorId']);
                echo json_encode(["success" => true]);

            } elseif ($subAction === 'delete') {
                $actorId   = $data['actorId']   ?? '';
                $actorName = $data['actorName'] ?? 'Admin';
                $stmt = $conn->prepare("SELECT title FROM projects WHERE id = ?");
                $stmt->execute([$data['id']]);
                $proj = $stmt->fetch();
                $stmt = $conn->prepare("DELETE FROM projects WHERE id = ?");
                $stmt->execute([$data['id']]);
                if ($proj) logAudit($conn, $actorId, $actorName, 'project', $data['id'], 'deleted', 'title', $proj['title'], null);
                echo json_encode(["success" => true]);
            }
        }
        break;

    // ==================== MILESTONES ====================
    case 'milestones':
        if ($method === 'GET') {
            assertProjectAccess($conn, $ACTOR, $_GET['projectId'] ?? '');
            $stmt = $conn->prepare("SELECT * FROM milestones WHERE projectId = ? ORDER BY displayOrder ASC, dueDate ASC");
            $stmt->execute([$_GET['projectId'] ?? '']);
            echo json_encode($stmt->fetchAll());
        } elseif ($method === 'POST') {
            if ($subAction === 'create') {
                assertProjectAccess($conn, $ACTOR, $data['projectId'] ?? '');
                $id        = $data['id'] ?? generateId('ms');
                $actorId   = $data['actorId']   ?? '';
                $actorName = $data['actorName'] ?? 'User';
                $orderStmt = $conn->prepare("SELECT COALESCE(MAX(displayOrder), -1) + 1 FROM milestones WHERE projectId = ?");
                $orderStmt->execute([$data['projectId']]);
                $displayOrder = (int)$orderStmt->fetchColumn();
                $stmt = $conn->prepare("INSERT INTO milestones (id, projectId, title, description, dueDate, status, notes, displayOrder, createdBy, createdByName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$id, $data['projectId'], $data['title'], $data['description'] ?? '',
                                $data['dueDate'], $data['status'] ?? 'pending', $data['notes'] ?? '',
                                $displayOrder, $data['actorId'] ?? '', $data['actorName'] ?? 'Supervisor']);
                logAudit($conn, $actorId, $actorName, 'milestone', $id, 'created', 'title', null, $data['title']);
                echo json_encode(["success" => true, "id" => $id]);

            } elseif ($subAction === 'updateStatus') {
                assertProjectAccess($conn, $ACTOR, projectIdOf($conn, 'milestones', $data['id'] ?? ''));
                $actorId   = $data['actorId']   ?? '';
                $actorName = $data['actorName'] ?? 'User';
                $stmt = $conn->prepare("SELECT status FROM milestones WHERE id = ?");
                $stmt->execute([$data['id']]);
                $old = $stmt->fetch();
                $stmt = $conn->prepare("UPDATE milestones SET status = ?, updatedAt = NOW() WHERE id = ?");
                $stmt->execute([$data['status'], $data['id']]);
                logAudit($conn, $actorId, $actorName, 'milestone', $data['id'], 'status_changed', 'status', $old['status'] ?? '', $data['status']);
                echo json_encode(["success" => true]);

            } elseif ($subAction === 'reorder') {
                $ids = $data['ids'] ?? [];
                if (!empty($ids)) assertProjectAccess($conn, $ACTOR, projectIdOf($conn, 'milestones', $ids[0]));
                $conn->beginTransaction();
                $stmt = $conn->prepare("UPDATE milestones SET displayOrder = ? WHERE id = ?");
                foreach ($ids as $idx => $id) $stmt->execute([$idx, $id]);
                $conn->commit();
                echo json_encode(["success" => true]);

            } elseif ($subAction === 'delete') {
                assertProjectAccess($conn, $ACTOR, projectIdOf($conn, 'milestones', $data['id'] ?? ''));
                $actorId   = $data['actorId']   ?? '';
                $actorName = $data['actorName'] ?? 'Supervisor';
                $stmt = $conn->prepare("SELECT title FROM milestones WHERE id = ?");
                $stmt->execute([$data['id']]);
                $ms = $stmt->fetch();
                $stmt = $conn->prepare("DELETE FROM milestones WHERE id = ?");
                $stmt->execute([$data['id']]);
                if ($ms) logAudit($conn, $actorId, $actorName, 'milestone', $data['id'], 'deleted', 'title', $ms['title'], null);
                echo json_encode(["success" => true]);
            }
        }
        break;

    // ==================== TASKS ====================
    case 'tasks':
        if ($method === 'GET') {
            // Single task by id (for the Task Detail view), access-checked.
            if (!empty($_GET['id'])) {
                $stmt = $conn->prepare("SELECT t.*, p.title as projectTitle, p.supervisorId, u.name as assigneeName FROM tasks t LEFT JOIN projects p ON p.id=t.projectId LEFT JOIN users u ON u.id=t.assignedTo WHERE t.id=?");
                $stmt->execute([$_GET['id']]);
                $t = $stmt->fetch();
                if (!$t) jsonError(404, 'Task not found.');
                if ($ACTOR['role'] === 'student') {
                    if ($t['assignedTo'] !== $ACTOR['id'] && !isProjectMember($conn, $ACTOR['id'], $t['projectId'])) jsonError(403, 'You do not have access to this task.');
                } elseif ($ACTOR['role'] === 'supervisor') {
                    assertProjectAccess($conn, $ACTOR, $t['projectId']);
                }
                echo json_encode($t);
                break;
            }
            // Students are locked to their own assigned tasks regardless of params.
            if ($ACTOR['role'] === 'student') {
                $stmt = $conn->prepare("SELECT t.*, p.title as projectTitle FROM tasks t LEFT JOIN projects p ON p.id=t.projectId WHERE t.assignedTo = ? ORDER BY FIELD(t.priority,'urgent','high','medium','low'), t.dueDate ASC");
                $stmt->execute([$ACTOR['id']]);
            } elseif (!empty($_GET['projectId'])) {
                assertProjectAccess($conn, $ACTOR, $_GET['projectId']);
                $stmt = $conn->prepare("SELECT * FROM tasks WHERE projectId = ? ORDER BY dueDate ASC, priority DESC");
                $stmt->execute([$_GET['projectId']]);
            } elseif (!empty($_GET['studentId'])) {
                $stmt = $conn->prepare("SELECT t.*, p.title as projectTitle FROM tasks t LEFT JOIN projects p ON p.id=t.projectId WHERE t.assignedTo = ? ORDER BY FIELD(t.priority,'urgent','high','medium','low'), t.dueDate ASC");
                $stmt->execute([$_GET['studentId']]);
            } else {
                // Admin only (supervisors are scoped via projectId above).
                $stmt = $conn->prepare("SELECT t.*, p.title as projectTitle FROM tasks t LEFT JOIN projects p ON p.id=t.projectId ORDER BY t.dueDate ASC");
                $stmt->execute();
            }
            echo json_encode($stmt->fetchAll());

        } elseif ($method === 'POST') {
            if ($subAction === 'create') {
                assertProjectAccess($conn, $ACTOR, $data['projectId'] ?? '');
                $id        = $data['id'] ?? generateId('task');
                $actorId   = $data['actorId']   ?? '';
                $actorName = $data['actorName'] ?? 'Supervisor';
                $stmt = $conn->prepare("INSERT INTO tasks (id, projectId, milestoneId, title, description, assignedTo, assignedBy, assignedByName, priority, dueDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$id, $data['projectId'], ($data['milestoneId'] ?? '') ?: null,
                                $data['title'], $data['description'] ?? '',
                                $data['assignedTo'], $actorId, $actorName,
                                $data['priority'] ?? 'medium', $data['dueDate']]);
                logAudit($conn, $actorId, $actorName, 'task', $id, 'created', 'title', null, $data['title']);
                echo json_encode(["success" => true, "id" => $id]);

            } elseif ($subAction === 'updateStatus') {
                assertTaskAccess($conn, $ACTOR, $data['id'] ?? '');
                $actorId   = $data['actorId']   ?? '';
                $actorName = $data['actorName'] ?? 'User';
                $stmt = $conn->prepare("SELECT status FROM tasks WHERE id = ?");
                $stmt->execute([$data['id']]);
                $old = $stmt->fetch();
                $completedDate = ($data['status'] === 'completed') ? date('Y-m-d') : null;
                $stmt = $conn->prepare("UPDATE tasks SET status = ?, completedDate = ?, updatedAt = NOW() WHERE id = ?");
                $stmt->execute([$data['status'], $completedDate, $data['id']]);
                logAudit($conn, $actorId, $actorName, 'task', $data['id'], 'status_changed', 'status', $old['status'] ?? '', $data['status']);
                echo json_encode(["success" => true]);

            } elseif ($subAction === 'updateNotes') {
                assertTaskAccess($conn, $ACTOR, $data['id'] ?? '');
                $stmt = $conn->prepare("UPDATE tasks SET studentNotes = ?, updatedAt = NOW() WHERE id = ?");
                $stmt->execute([$data['notes'] ?? '', $data['id']]);
                echo json_encode(["success" => true]);

            } elseif ($subAction === 'submit') {
                // Student submits their work for review.
                assertTaskAccess($conn, $ACTOR, $data['id'] ?? '');
                $stmt = $conn->prepare("UPDATE tasks SET status='submitted', studentNotes=?, updatedAt=NOW() WHERE id=?");
                $stmt->execute([$data['notes'] ?? '', $data['id']]);
                logAudit($conn, $ACTOR['id'], $ACTOR['name'], 'task', $data['id'], 'submitted', 'status', null, 'submitted');
                echo json_encode(["success" => true]);

            } elseif ($subAction === 'review') {
                // Supervisor approves (completed) or returns for revision.
                assertProjectAccess($conn, $ACTOR, projectIdOf($conn, 'tasks', $data['id'] ?? ''));
                $newStatus = (($data['decision'] ?? 'completed') === 'returned') ? 'returned' : 'completed';
                $completedDate = ($newStatus === 'completed') ? date('Y-m-d') : null;
                $stmt = $conn->prepare("UPDATE tasks SET status=?, supervisorFeedback=?, completedDate=?, updatedAt=NOW() WHERE id=?");
                $stmt->execute([$newStatus, $data['feedback'] ?? '', $completedDate, $data['id']]);
                logAudit($conn, $ACTOR['id'], $ACTOR['name'], 'task', $data['id'], $newStatus === 'completed' ? 'approved' : 'returned', 'status', 'submitted', $newStatus);
                if (!empty($data['feedback'])) logAudit($conn, $ACTOR['id'], $ACTOR['name'], 'task', $data['id'], 'feedback_added', 'feedback', null, $data['feedback']);
                echo json_encode(["success" => true]);

            } elseif ($subAction === 'upload') {
                // Attach a file to a task (student's work or supervisor's returned file).
                $taskId = $data['taskId'] ?? $data['id'] ?? '';
                assertTaskAccess($conn, $ACTOR, $taskId);
                if (!$uploadedFile) jsonError(400, 'No file provided.');
                try {
                    $r = handleFileUpload($conn, $uploadedFile, 'task', $taskId, $ACTOR['id']);
                    logAudit($conn, $ACTOR['id'], $ACTOR['name'], 'task', $taskId, 'file_uploaded', 'file', null, $r['fileName']);
                    echo json_encode(["success" => true] + $r);
                } catch (Exception $e) { jsonError(400, $e->getMessage()); }

            } elseif ($subAction === 'delete') {
                assertProjectAccess($conn, $ACTOR, projectIdOf($conn, 'tasks', $data['id'] ?? ''));
                $actorId   = $data['actorId']   ?? '';
                $actorName = $data['actorName'] ?? 'Supervisor';
                $stmt = $conn->prepare("SELECT title FROM tasks WHERE id = ?");
                $stmt->execute([$data['id']]);
                $task = $stmt->fetch();
                $stmt = $conn->prepare("DELETE FROM tasks WHERE id = ?");
                $stmt->execute([$data['id']]);
                if ($task) logAudit($conn, $actorId, $actorName, 'task', $data['id'], 'deleted', 'title', $task['title'], null);
                echo json_encode(["success" => true]);
            }
        }
        break;

    // ==================== REPORTS ====================
    case 'reports':
        if ($method === 'GET') {
            // Join only the LATEST file per report (avoid duplicate report rows).
            $join = "SELECT r.*, fu.id as fileId, fu.originalName as fileName, fu.fileSize
                     FROM reports r
                     LEFT JOIN file_uploads fu ON fu.id = (SELECT id FROM file_uploads WHERE entityType='report' AND entityId=r.id ORDER BY uploadedAt DESC LIMIT 1)";
            if ($ACTOR['role'] === 'student') {
                $stmt = $conn->prepare("$join WHERE r.projectId IN (SELECT projectId FROM project_members WHERE studentId = ?) ORDER BY r.submittedDate DESC");
                $stmt->execute([$ACTOR['id']]);
            } elseif ($ACTOR['role'] === 'supervisor') {
                $stmt = $conn->prepare("$join JOIN projects p2 ON p2.id = r.projectId WHERE p2.supervisorId = ? ORDER BY r.submittedDate DESC");
                $stmt->execute([$ACTOR['id']]);
            } elseif (!empty($_GET['projectId'])) {
                $stmt = $conn->prepare("$join WHERE r.projectId = ? ORDER BY r.submittedDate DESC");
                $stmt->execute([$_GET['projectId']]);
            } else {
                $stmt = $conn->prepare("$join ORDER BY r.submittedDate DESC");
                $stmt->execute();
            }
            echo json_encode($stmt->fetchAll());

        } elseif ($method === 'POST') {
            if ($subAction === 'create') {
                assertProjectAccess($conn, $ACTOR, $data['projectId'] ?? '');
                $id        = $data['id'] ?? generateId('rep');
                $studentId = ($ACTOR['role'] === 'student') ? $ACTOR['id'] : ($data['studentId'] ?? '');
                $actorName = $data['studentName'] ?? $ACTOR['name'];

                $stmt = $conn->prepare("INSERT INTO reports (id, projectId, studentId, title, description, submittedDate, status, updatedBy) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)");
                $stmt->execute([$id, $data['projectId'], $studentId, $data['title'],
                                $data['description'], $data['submittedDate'], $studentId]);

                // Version the report content so it appears in history / diffs.
                saveDocumentVersion($conn, 'report', $id, $data['title'], $data['description'] ?? '', '', $studentId, $actorName);

                if ($uploadedFile) {
                    try { handleFileUpload($conn, $uploadedFile, 'report', $id, $studentId); }
                    catch (Exception $e) { debug_log("File upload: " . $e->getMessage()); }
                }

                logAudit($conn, $studentId, $actorName, 'report', $id, 'submitted', 'title', null, $data['title']);
                echo json_encode(["success" => true, "id" => $id]);

            } elseif ($subAction === 'review') {
                assertProjectAccess($conn, $ACTOR, projectIdOf($conn, 'reports', $data['id'] ?? ''));
                $actorId   = $data['actorId']   ?? '';
                $actorName = $data['actorName'] ?? 'Supervisor';
                $stmt = $conn->prepare("SELECT status FROM reports WHERE id = ?");
                $stmt->execute([$data['id']]);
                $old = $stmt->fetch();
                $stmt = $conn->prepare("UPDATE reports SET status = ?, feedback = ?, updatedBy = ?, updatedAt = NOW() WHERE id = ?");
                $stmt->execute([$data['status'], $data['feedback'], $actorId, $data['id']]);
                logAudit($conn, $actorId, $actorName, 'report', $data['id'], 'reviewed', 'status', $old['status'] ?? '', $data['status']);
                if ($data['feedback']) {
                    logAudit($conn, $actorId, $actorName, 'report', $data['id'], 'feedback_added', 'feedback', null, $data['feedback']);
                }
                echo json_encode(["success" => true]);
            }
        }
        break;

    // ==================== MESSAGES ====================
    case 'messages':
        if ($method === 'GET') {
            // Inbox mode: every message addressed to me (for unread counts / notifications).
            if (!empty($_GET['inbox'])) {
                $stmt = $conn->prepare("SELECT m.*, u.name as fromName FROM messages m LEFT JOIN users u ON u.id=m.fromId WHERE m.toId=? ORDER BY m.timestamp DESC LIMIT 50");
                $stmt->execute([$ACTOR['id']]);
                echo json_encode($stmt->fetchAll());
                break;
            }
            // The caller is always one side of the conversation; the other is the partner.
            $me      = $ACTOR['id'];
            $partner = $_GET['toId'] ?? '';
            if ($partner) {
                $stmt = $conn->prepare("SELECT * FROM messages WHERE (fromId=? AND toId=?) OR (fromId=? AND toId=?) ORDER BY timestamp ASC");
                $stmt->execute([$me, $partner, $partner, $me]);
                // Mark messages sent to me by the partner as read.
                $conn->prepare("UPDATE messages SET is_read=1 WHERE toId=? AND fromId=?")->execute([$me, $partner]);
                echo json_encode($stmt->fetchAll());
            } else {
                echo json_encode([]);
            }
        } elseif ($method === 'POST' && $subAction === 'create') {
            // Sender is always the authenticated user (cannot spoof fromId).
            $id = $data['id'] ?? generateId('msg');
            $stmt = $conn->prepare("INSERT INTO messages (id, fromId, toId, projectId, text, is_read) VALUES (?, ?, ?, ?, ?, 0)");
            $stmt->execute([$id, $ACTOR['id'], $data['toId'], $data['projectId'] ?? null, $data['text']]);
            echo json_encode(["success" => true]);
        }
        break;

    // ==================== AUDIT LOGS ====================
    case 'audit_logs':
        if ($method === 'GET') {
            $entityType = $_GET['entityType'] ?? '';
            $entityId   = $_GET['entityId']   ?? '';
            $limit      = min((int)($_GET['limit'] ?? 100), 500);

            // Only admins may browse the global log; others must scope to a specific entity.
            if ($ACTOR['role'] !== 'admin' && !$entityId) {
                jsonError(403, 'Administrator access required to view the full audit log.');
            }

            // $limit is forced to an int above, so it is safe to inline.
            // (Binding LIMIT as a positional param makes PDO send LIMIT '8' -> SQL syntax error.)
            if ($entityType && $entityId) {
                $stmt = $conn->prepare("SELECT * FROM audit_logs WHERE entityType=? AND entityId=? ORDER BY timestamp DESC LIMIT $limit");
                $stmt->execute([$entityType, $entityId]);
            } elseif ($entityType) {
                $stmt = $conn->prepare("SELECT * FROM audit_logs WHERE entityType=? ORDER BY timestamp DESC LIMIT $limit");
                $stmt->execute([$entityType]);
            } else {
                $stmt = $conn->prepare("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT $limit");
                $stmt->execute([]);
            }
            echo json_encode($stmt->fetchAll());
        }
        break;

    // ==================== DOCUMENT VERSIONS ====================
    case 'document_versions':
        if ($method === 'GET') {
            $stmt = $conn->prepare("SELECT * FROM document_versions WHERE entityType=? AND entityId=? ORDER BY version DESC");
            $stmt->execute([$_GET['entityType'] ?? '', $_GET['entityId'] ?? '']);
            echo json_encode($stmt->fetchAll());
        }
        break;

    // ==================== FILES LIST ====================
    case 'files':
        if ($method === 'GET' && $subAction === 'list') {
            $stmt = $conn->prepare("SELECT * FROM file_uploads WHERE entityType=? AND entityId=? ORDER BY uploadedAt DESC");
            $stmt->execute([$_GET['entityType'] ?? '', $_GET['entityId'] ?? '']);
            echo json_encode($stmt->fetchAll());
        }
        break;

    // ==================== ANNOUNCEMENTS ====================
    case 'announcements':
        if ($method === 'GET') {
            $role = $_GET['role'] ?? '';
            if ($role && $role !== 'admin') {
                $stmt = $conn->prepare("SELECT * FROM announcements WHERE targetRole='all' OR targetRole=? ORDER BY FIELD(priority,'urgent','important','normal'), createdAt DESC LIMIT 50");
                $stmt->execute([$role]);
            } else {
                $stmt = $conn->prepare("SELECT * FROM announcements ORDER BY FIELD(priority,'urgent','important','normal'), createdAt DESC LIMIT 100");
                $stmt->execute();
            }
            echo json_encode($stmt->fetchAll());

        } elseif ($method === 'POST') {
            if ($subAction === 'create') {
                $id = generateId('ann');
                $stmt = $conn->prepare("INSERT INTO announcements (id, title, body, authorId, authorName, targetRole, priority) VALUES (?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$id, $data['title'], $data['body'], $ACTOR['id'], $ACTOR['name'], $data['targetRole'] ?? 'all', $data['priority'] ?? 'normal']);
                logAudit($conn, $ACTOR['id'], $ACTOR['name'], 'announcement', $id, 'created', 'title', null, $data['title']);
                echo json_encode(["success" => true, "id" => $id]);

            } elseif ($subAction === 'delete') {
                $stmt = $conn->prepare("DELETE FROM announcements WHERE id = ?");
                $stmt->execute([$data['id']]);
                echo json_encode(["success" => true]);
            }
        }
        break;

    // ==================== MEETINGS ====================
    case 'meetings':
        if ($method === 'GET') {
            if ($ACTOR['role'] === 'student') {
                $stmt = $conn->prepare("SELECT m.*, p.title as projectTitle, u.name as supervisorName FROM meetings m LEFT JOIN projects p ON p.id=m.projectId LEFT JOIN users u ON u.id=m.supervisorId WHERE m.projectId IN (SELECT projectId FROM project_members WHERE studentId=?) ORDER BY m.scheduledAt ASC");
                $stmt->execute([$ACTOR['id']]);
            } elseif ($ACTOR['role'] === 'supervisor') {
                $stmt = $conn->prepare("SELECT m.*, p.title as projectTitle, u.name as studentName FROM meetings m LEFT JOIN projects p ON p.id=m.projectId LEFT JOIN users u ON u.id=m.studentId WHERE m.supervisorId=? ORDER BY m.scheduledAt ASC");
                $stmt->execute([$ACTOR['id']]);
            } elseif (!empty($_GET['projectId'])) {
                $stmt = $conn->prepare("SELECT * FROM meetings WHERE projectId = ? ORDER BY scheduledAt ASC");
                $stmt->execute([$_GET['projectId']]);
            } elseif (!empty($_GET['supervisorId'])) {
                $stmt = $conn->prepare("SELECT m.*, p.title as projectTitle, u.name as studentName FROM meetings m LEFT JOIN projects p ON p.id=m.projectId LEFT JOIN users u ON u.id=m.studentId WHERE m.supervisorId=? ORDER BY m.scheduledAt ASC");
                $stmt->execute([$_GET['supervisorId']]);
            } elseif (!empty($_GET['studentId'])) {
                $stmt = $conn->prepare("SELECT m.*, p.title as projectTitle, u.name as supervisorName FROM meetings m LEFT JOIN projects p ON p.id=m.projectId LEFT JOIN users u ON u.id=m.supervisorId WHERE m.studentId=? ORDER BY m.scheduledAt ASC");
                $stmt->execute([$_GET['studentId']]);
            } else {
                $stmt = $conn->prepare("SELECT m.*, p.title as projectTitle FROM meetings m LEFT JOIN projects p ON p.id=m.projectId ORDER BY m.scheduledAt ASC LIMIT 200");
                $stmt->execute();
            }
            echo json_encode($stmt->fetchAll());

        } elseif ($method === 'POST') {
            if ($subAction === 'create') {
                $proj = loadProject($conn, $data['projectId'] ?? '');
                assertProjectAccess($conn, $ACTOR, $data['projectId'] ?? '');
                $id = generateId('meet');
                // Participants are taken from the project, not from client input.
                $stmt = $conn->prepare("INSERT INTO meetings (id, projectId, supervisorId, studentId, title, agenda, scheduledAt, location, meetingType) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$id, $data['projectId'], $proj['supervisorId'], $proj['studentId'], $data['title'], $data['agenda'] ?? '', $data['scheduledAt'], $data['location'] ?? 'TBD', $data['meetingType'] ?? 'weekly']);
                logAudit($conn, $ACTOR['id'], $ACTOR['name'], 'meeting', $id, 'created', 'title', null, $data['title']);
                echo json_encode(["success" => true, "id" => $id]);

            } elseif ($subAction === 'complete') {
                assertProjectAccess($conn, $ACTOR, projectIdOf($conn, 'meetings', $data['id'] ?? ''));
                $stmt = $conn->prepare("UPDATE meetings SET status='completed', minutesNotes=? WHERE id=?");
                $stmt->execute([$data['minutesNotes'] ?? '', $data['id']]);
                echo json_encode(["success" => true]);

            } elseif ($subAction === 'cancel') {
                assertProjectAccess($conn, $ACTOR, projectIdOf($conn, 'meetings', $data['id'] ?? ''));
                $stmt = $conn->prepare("UPDATE meetings SET status='cancelled' WHERE id=?");
                $stmt->execute([$data['id']]);
                echo json_encode(["success" => true]);

            } elseif ($subAction === 'delete') {
                assertProjectAccess($conn, $ACTOR, projectIdOf($conn, 'meetings', $data['id'] ?? ''));
                $stmt = $conn->prepare("DELETE FROM meetings WHERE id=?");
                $stmt->execute([$data['id']]);
                echo json_encode(["success" => true]);
            }
        }
        break;

    // ==================== EVALUATIONS ====================
    case 'evaluations':
        if ($method === 'GET') {
            if ($ACTOR['role'] === 'student') {
                $stmt = $conn->prepare("SELECT e.*, p.title as projectTitle FROM evaluations e LEFT JOIN projects p ON p.id=e.projectId WHERE e.projectId IN (SELECT projectId FROM project_members WHERE studentId=?) ORDER BY e.evaluatedAt DESC");
                $stmt->execute([$ACTOR['id']]);
            } elseif ($ACTOR['role'] === 'supervisor') {
                $stmt = $conn->prepare("SELECT e.*, p.title as projectTitle FROM evaluations e LEFT JOIN projects p ON p.id=e.projectId WHERE p.supervisorId=? ORDER BY e.evaluatedAt DESC");
                $stmt->execute([$ACTOR['id']]);
            } elseif (!empty($_GET['projectId'])) {
                $stmt = $conn->prepare("SELECT * FROM evaluations WHERE projectId=? ORDER BY evaluatedAt DESC");
                $stmt->execute([$_GET['projectId']]);
            } elseif (!empty($_GET['supervisorId'])) {
                $stmt = $conn->prepare("SELECT e.*, p.title as projectTitle FROM evaluations e LEFT JOIN projects p ON p.id=e.projectId WHERE p.supervisorId=? ORDER BY e.evaluatedAt DESC");
                $stmt->execute([$_GET['supervisorId']]);
            } elseif (!empty($_GET['studentId'])) {
                $stmt = $conn->prepare("SELECT e.*, p.title as projectTitle FROM evaluations e LEFT JOIN projects p ON p.id=e.projectId WHERE p.studentId=? ORDER BY e.evaluatedAt DESC");
                $stmt->execute([$_GET['studentId']]);
            } else {
                $stmt = $conn->prepare("SELECT e.*, p.title as projectTitle FROM evaluations e LEFT JOIN projects p ON p.id=e.projectId ORDER BY e.evaluatedAt DESC LIMIT 200");
                $stmt->execute();
            }
            echo json_encode($stmt->fetchAll());

        } elseif ($method === 'POST' && $subAction === 'create') {
            assertProjectAccess($conn, $ACTOR, $data['projectId'] ?? '');
            // Evaluator is the authenticated user, not a client-supplied value.
            $data['evaluatorId']   = $ACTOR['id'];
            $data['evaluatorName'] = $ACTOR['name'];
            $id = generateId('eval');
            $proposal       = round(floatval($data['proposalMarks']        ?? 0), 2);
            $presentation   = round(floatval($data['presentationMarks']    ?? 0), 2);
            $implementation = round(floatval($data['implementationMarks']  ?? 0), 2);
            $viva           = round(floatval($data['vivaMarks']            ?? 0), 2);
            $total          = $proposal + $presentation + $implementation + $viva;

            if ($total >= 85) $grade = 'A';
            elseif ($total >= 80) $grade = 'B+';
            elseif ($total >= 75) $grade = 'B';
            elseif ($total >= 70) $grade = 'C+';
            elseif ($total >= 65) $grade = 'C';
            elseif ($total >= 60) $grade = 'D';
            else $grade = 'F';

            $role = in_array(($data['evaluatorRole'] ?? 'supervisor'), ['supervisor','internal','external','coordinator'], true) ? $data['evaluatorRole'] : 'supervisor';
            $stmt = $conn->prepare("INSERT INTO evaluations (id, projectId, evaluatorId, evaluatorName, evaluatorRole, phase, proposalMarks, presentationMarks, implementationMarks, vivaMarks, totalMarks, grade, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$id, $data['projectId'], $data['evaluatorId'] ?? '', $data['evaluatorName'] ?? '', $role, $data['phase'] ?? 'fyp1', $proposal, $presentation, $implementation, $viva, $total, $grade, $data['remarks'] ?? '']);
            logAudit($conn, $data['evaluatorId'] ?? '', $data['evaluatorName'] ?? 'Evaluator', 'evaluation', $id, 'created', 'phase', null, strtoupper($data['phase'] ?? 'fyp1') . ' → ' . $grade . ' (' . $total . '/100)');
            echo json_encode(["success" => true, "id" => $id, "total" => $total, "grade" => $grade]);
        }
        break;

    // ==================== SUPERVISOR REQUESTS ====================
    case 'supervisor_requests':
        if ($method === 'GET') {
            if ($ACTOR['role'] === 'supervisor') {
                $stmt = $conn->prepare("SELECT sr.*, u.program, u.department FROM supervisor_requests sr LEFT JOIN users u ON u.id=sr.studentId WHERE sr.supervisorId=? ORDER BY sr.createdAt DESC");
                $stmt->execute([$ACTOR['id']]);
            } elseif ($ACTOR['role'] === 'student') {
                $stmt = $conn->prepare("SELECT sr.*, u.name as supName, u.specialization FROM supervisor_requests sr LEFT JOIN users u ON u.id=sr.supervisorId WHERE sr.studentId=? ORDER BY sr.createdAt DESC");
                $stmt->execute([$ACTOR['id']]);
            } elseif (!empty($_GET['supervisorId'])) {
                $stmt = $conn->prepare("SELECT sr.*, u.program, u.department FROM supervisor_requests sr LEFT JOIN users u ON u.id=sr.studentId WHERE sr.supervisorId=? ORDER BY sr.createdAt DESC");
                $stmt->execute([$_GET['supervisorId']]);
            } elseif (!empty($_GET['studentId'])) {
                $stmt = $conn->prepare("SELECT sr.*, u.name as supName, u.specialization FROM supervisor_requests sr LEFT JOIN users u ON u.id=sr.supervisorId WHERE sr.studentId=? ORDER BY sr.createdAt DESC");
                $stmt->execute([$_GET['studentId']]);
            } else {
                $stmt = $conn->prepare("SELECT * FROM supervisor_requests ORDER BY createdAt DESC LIMIT 200");
                $stmt->execute();
            }
            echo json_encode($stmt->fetchAll());

        } elseif ($method === 'POST') {
            if ($subAction === 'create') {
                // Student identity is derived from the session (not client-supplied).
                if ($ACTOR['role'] === 'student') {
                    $u = $conn->prepare("SELECT name, rollNo FROM users WHERE id=?"); $u->execute([$ACTOR['id']]); $me = $u->fetch();
                    $studentId = $ACTOR['id']; $studentName = $ACTOR['name']; $studentRoll = $me['rollNo'] ?? '';
                } else {
                    $studentId = $data['studentId'] ?? ''; $studentName = $data['studentName'] ?? ''; $studentRoll = $data['studentRoll'] ?? '';
                }
                if (!$data['supervisorId']) { echo json_encode(["error" => "Please select a supervisor."]); exit; }
                // Check for an existing pending request for this supervisor.
                $chk = $conn->prepare("SELECT id FROM supervisor_requests WHERE studentId=? AND supervisorId=? AND status='pending'");
                $chk->execute([$studentId, $data['supervisorId']]);
                if ($chk->fetch()) {
                    echo json_encode(["error" => "You already have a pending request for this supervisor."]); exit;
                }
                $id = generateId('req');
                $stmt = $conn->prepare("INSERT INTO supervisor_requests (id, studentId, studentName, studentRoll, supervisorId, proposalTitle, proposalSummary) VALUES (?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$id, $studentId, $studentName, $studentRoll, $data['supervisorId'], $data['proposalTitle'] ?? '', $data['proposalSummary'] ?? '']);
                logAudit($conn, $studentId, $studentName, 'supervisor_request', $id, 'created', 'supervisorId', null, $data['supervisorId']);
                echo json_encode(["success" => true, "id" => $id]);

            } elseif ($subAction === 'respond') {
                // A supervisor may only respond to requests addressed to them.
                if ($ACTOR['role'] === 'supervisor') {
                    $chk = $conn->prepare("SELECT supervisorId FROM supervisor_requests WHERE id=?");
                    $chk->execute([$data['id']]);
                    if ($chk->fetchColumn() !== $ACTOR['id']) jsonError(403, 'This request was not sent to you.');
                }
                $stmt = $conn->prepare("UPDATE supervisor_requests SET status=?, supervisorResponse=?, respondedAt=NOW() WHERE id=?");
                $stmt->execute([$data['status'], $data['response'] ?? '', $data['id']]);
                logAudit($conn, $ACTOR['id'], $ACTOR['name'], 'supervisor_request', $data['id'], 'responded', 'status', 'pending', $data['status']);
                echo json_encode(["success" => true]);
            }
        }
        break;

    // ==================== DEADLINES / FYP TIMELINE ====================
    case 'deadlines':
        if ($method === 'GET') {
            $stmt = $conn->prepare("SELECT * FROM deadlines ORDER BY dueDate ASC");
            $stmt->execute();
            echo json_encode($stmt->fetchAll());

        } elseif ($method === 'POST') {
            if ($subAction === 'create') {
                $id = generateId('dl');
                $stmt = $conn->prepare("INSERT INTO deadlines (id, title, description, dueDate, phase, category, program, createdBy, createdByName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$id, $data['title'], $data['description'] ?? '', $data['dueDate'],
                                $data['phase'] ?? 'all', $data['category'] ?? 'other', $data['program'] ?? 'all',
                                $ACTOR['id'], $ACTOR['name']]);
                logAudit($conn, $ACTOR['id'], $ACTOR['name'], 'deadline', $id, 'created', 'title', null, $data['title']);
                echo json_encode(["success" => true, "id" => $id]);

            } elseif ($subAction === 'update') {
                $stmt = $conn->prepare("UPDATE deadlines SET title=?, description=?, dueDate=?, phase=?, category=?, program=? WHERE id=?");
                $stmt->execute([$data['title'], $data['description'] ?? '', $data['dueDate'],
                                $data['phase'] ?? 'all', $data['category'] ?? 'other', $data['program'] ?? 'all', $data['id']]);
                logAudit($conn, $ACTOR['id'], $ACTOR['name'], 'deadline', $data['id'], 'updated', 'title', null, $data['title']);
                echo json_encode(["success" => true]);

            } elseif ($subAction === 'delete') {
                $stmt = $conn->prepare("SELECT title FROM deadlines WHERE id=?");
                $stmt->execute([$data['id']]);
                $dl = $stmt->fetch();
                $conn->prepare("DELETE FROM deadlines WHERE id=?")->execute([$data['id']]);
                if ($dl) logAudit($conn, $ACTOR['id'], $ACTOR['name'], 'deadline', $data['id'], 'deleted', 'title', $dl['title'], null);
                echo json_encode(["success" => true]);
            }
        }
        break;

    // ==================== PROPOSAL SUBMISSION HISTORY ====================
    case 'proposal_submissions':
        if ($method === 'GET') {
            $projectId = $_GET['projectId'] ?? '';
            assertProjectAccess($conn, $ACTOR, $projectId);
            $stmt = $conn->prepare("SELECT * FROM proposal_submissions WHERE projectId = ? ORDER BY attempt DESC");
            $stmt->execute([$projectId]);
            echo json_encode($stmt->fetchAll());
        }
        break;

    // ==================== PROJECT MEMBERS ====================
    case 'project_members':
        if ($method === 'GET') {
            $projectId = $_GET['projectId'] ?? '';
            assertProjectAccess($conn, $ACTOR, $projectId);
            $stmt = $conn->prepare("SELECT pm.studentId, pm.isLeader, pm.joinedAt, u.name, u.rollNo, u.email
                                    FROM project_members pm LEFT JOIN users u ON u.id = pm.studentId
                                    WHERE pm.projectId = ? ORDER BY pm.isLeader DESC, pm.joinedAt ASC");
            $stmt->execute([$projectId]);
            echo json_encode($stmt->fetchAll());
        }
        break;

    default:
        http_response_code(404);
        echo json_encode(["error" => "Invalid action: $mainAction"]);
        break;
}
?>
