import os
import logging

logger = logging.getLogger(__name__)

class Database:
    def __init__(self):
        self.connection = None

    def connect(self):
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
                password=password
            )
            if self.connection.is_connected():
                logger.info("Connected to MySQL database")
                return True
        except Exception as e:
            logger.warning(f"MySQL Connection unavailable ({e}). Using local memory/storage mode.")
            self.connection = None
            return False

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
