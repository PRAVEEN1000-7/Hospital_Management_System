"""
Migration script to create Products master table and stock overview tables.
"""
import os
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

# Database connection parameters
DB_CONFIG = {
    'dbname': 'hms_db',
    'user': 'hms_user',
    'password': 'HMS@2026',
    'host': 'localhost',
    'port': '5432'
}

def run_migration():
    print("Connecting to database...")
    
    try:
        # Connect with autocommit to allow DDL statements
        conn = psycopg2.connect(**DB_CONFIG)
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()
        
        print("Connected. Running migration...\n")
        
        # Read the migration SQL file
        migration_sql_path = os.path.join(os.path.dirname(__file__), '..', 'database_hole', '06_products_master_table.sql')
        
        print(f"Reading SQL from: {migration_sql_path}")
        
        with open(migration_sql_path, 'r', encoding='utf-8') as f:
            sql_content = f.read()
        
        # Execute the entire SQL file
        print("Executing SQL statements...")
        cursor.execute(sql_content)
        
        conn.commit()
        
        print("\n✓ Migration completed successfully!")
        
        # Verify tables were created
        print("\nVerifying tables...")
        cursor.execute("""
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('products', 'stock_summary', 'stock_alerts')
            ORDER BY table_name
        """)
        
        existing_tables = [row[0] for row in cursor.fetchall()]
        expected_tables = ['products', 'stock_summary', 'stock_alerts']
        
        for table in expected_tables:
            if table in existing_tables:
                print(f"  ✓ Table '{table}' exists")
            else:
                print(f"  ✗ Table '{table}' NOT found")
        
        cursor.close()
        conn.close()
        
    except psycopg2.Error as e:
        print(f"\n✗ Database error: {e}")
        raise
    except Exception as e:
        print(f"\n✗ Migration failed: {e}")
        raise

if __name__ == "__main__":
    run_migration()
