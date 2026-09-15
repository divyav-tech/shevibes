import os
import logging

import time

logger = logging.getLogger(__name__)

class Database:
    def __init__(self):
        self.connection = None
        self._last_connect_attempt = 0
        self._cooldown_seconds = 10

    def connect(self):
        now = time.time()
        if now - self._last_connect_attempt < self._cooldown_seconds:
            return False
        self._last_connect_attempt = now

        try:
            import mysql.connector
            from mysql.connector import Error
            
            host = os.getenv('DB_HOST', 'localhost')
            database = os.getenv('DB_NAME', 'campus_board')
            user = os.getenv('DB_USER', 'root')
            password = os.getenv('DB_PASSWORD', '')

            self.connection = mysql.connector.connect(
                host=host,
                database=database,
                user=user,
                password=password,
                connection_timeout=2
            )
            if self.connection.is_connected():
                logger.info("Connected to MySQL database")
                self.ensure_schema()
                return True
        except Exception as e:
            logger.warning(f"MySQL Connection unavailable ({e}). Using local memory/storage mode.")
            self.connection = None
            return False

    def ensure_schema(self):
        if not self.connection or not self.connection.is_connected():
            return
        try:
            cursor = self.connection.cursor(dictionary=True)
            cursor.execute("SHOW TABLES LIKE 'users'")
            if cursor.fetchone():
                cursor.execute("SHOW COLUMNS FROM users LIKE 'college_email'")
                if not cursor.fetchone():
                    cursor.execute("ALTER TABLE users ADD COLUMN college_email VARCHAR(255) UNIQUE AFTER name")
                cursor.execute("SHOW COLUMNS FROM users LIKE 'password_hash'")
                if not cursor.fetchone():
                    cursor.execute("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NOT NULL AFTER college_email")
                self.connection.commit()
        except Exception as e:
            logger.warning(f"Schema migration note: {e}")

    def disconnect(self):
        if self.connection and self.connection.is_connected():
            self.connection.close()

    def execute_query(self, query, params=None):
        if not self.connection or not self.connection.is_connected():
            if not self.connect():
                return None
        try:
            cursor = self.connection.cursor(dictionary=True)
            cursor.execute(query, params)
            self.connection.commit()
            return cursor
        except Exception as e:
            logger.error(f"Error executing query: {e}")
            return None

    def fetch_all(self, query, params=None):
        if not self.connection or not self.connection.is_connected():
            if not self.connect():
                return []
        try:
            cursor = self.connection.cursor(dictionary=True)
            cursor.execute(query, params)
            return cursor.fetchall()
        except Exception as e:
            logger.error(f"Error fetching data: {e}")
            return []

    def fetch_one(self, query, params=None):
        if not self.connection or not self.connection.is_connected():
            if not self.connect():
                return None
        try:
            cursor = self.connection.cursor(dictionary=True)
            cursor.execute(query, params)
            return cursor.fetchone()
        except Exception as e:
            logger.error(f"Error fetching single row: {e}")
            return None

db = Database()
