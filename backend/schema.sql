CREATE DATABASE IF NOT EXISTS campus_board;
USE campus_board;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    college VARCHAR(200),
    year VARCHAR(10),
    branch VARCHAR(50),
    section VARCHAR(10),
    role ENUM('student', 'cr') DEFAULT 'student',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS interests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS user_interests (
    user_id INT,
    interest_id INT,
    PRIMARY KEY (user_id, interest_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (interest_id) REFERENCES interests(id)
);

CREATE TABLE IF NOT EXISTS announcements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    summary TEXT,
    content TEXT,
    subject VARCHAR(100),
    action VARCHAR(100),
    time VARCHAR(20),
    venue VARCHAR(200),
    category ENUM('academic', 'event', 'deadline', 'opportunity', 'general', 'class', 'society', 'important') DEFAULT 'general',
    priority ENUM('high', 'medium', 'low') DEFAULT 'medium',
    posted_by INT,
    class_name VARCHAR(50),
    deadline DATE,
    tags TEXT,
    confidence FLOAT DEFAULT 1.0,
    source VARCHAR(100),
    ai_generated TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (posted_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS opportunities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    category ENUM('hackathon', 'workshop', 'internship', 'competition', 'webinar', 'scholarship', 'tech', 'volunteering', 'events', 'societies') DEFAULT 'workshop',
    link VARCHAR(500),
    deadline DATE,
    posted_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (posted_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS calendar_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    event_date DATE NOT NULL,
    event_time TIME,
    location VARCHAR(200),
    category ENUM('academic', 'deadline', 'event', 'opportunity', 'personal') DEFAULT 'academic',
    created_by INT,
    announcement_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (announcement_id) REFERENCES announcements(id)
);

CREATE TABLE IF NOT EXISTS chat_digests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    raw_chat TEXT NOT NULL,
    summary TEXT,
    useful_items_json TEXT,
    conflicts_json TEXT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS saved_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    item_type ENUM('announcement', 'opportunity', 'event') NOT NULL,
    item_id INT NOT NULL,
    saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
