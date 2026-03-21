"""
Migration script to add item_name columns to inventory tables.
Run this script to update the database schema.
"""
import os
from sqlalchemy import create_engine, text, inspect

# Database URL - adjust if needed
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://hms_user:HMS%402026@localhost:5432/hms_db"
)

def run_migration():
    print(f"Connecting to database...")
    
    try:
        engine = create_engine(DATABASE_URL)
        conn = engine.connect()
        
        print("Connected. Running migration...")
        
        # Check if columns already exist
        inspector = inspect(engine)
        
        tables_to_migrate = {
            'purchase_order_items': ['item_name', 'item_type'],
            'grn_items': ['item_name', 'item_type'],
            'stock_movements': ['item_name', 'item_type'],
            'stock_adjustments': ['item_name', 'item_type'],
            'cycle_count_items': ['item_name', 'item_type'],
        }
        
        for table, columns in tables_to_migrate.items():
            print(f"\nChecking table: {table}")
            if table in inspector.get_table_names():
                existing_columns = [col['name'] for col in inspector.get_columns(table)]
                for col in columns:
                    if col in existing_columns:
                        print(f"  ✓ Column '{col}' already exists")
                    else:
                        print(f"  - Column '{col}' needs to be added")
            else:
                print(f"  ! Table '{table}' not found")
        
        # Run the migration SQL
        migration_sql = """
        -- Add item_name to purchase_order_items
        ALTER TABLE purchase_order_items
            ADD COLUMN IF NOT EXISTS item_name VARCHAR(200) NOT NULL DEFAULT 'Unknown Item';
        ALTER TABLE purchase_order_items
            ALTER COLUMN item_id DROP NOT NULL;
        ALTER TABLE purchase_order_items
            ALTER COLUMN item_name DROP DEFAULT;

        -- Add item_name to grn_items
        ALTER TABLE grn_items
            ADD COLUMN IF NOT EXISTS item_name VARCHAR(200) NOT NULL DEFAULT 'Unknown Item';
        ALTER TABLE grn_items
            ALTER COLUMN item_id DROP NOT NULL;
        ALTER TABLE grn_items
            ALTER COLUMN item_name DROP DEFAULT;

        -- Add item_name to stock_movements
        ALTER TABLE stock_movements
            ADD COLUMN IF NOT EXISTS item_name VARCHAR(200);
        ALTER TABLE stock_movements
            ALTER COLUMN item_id DROP NOT NULL;

        -- Add item_name to stock_adjustments
        ALTER TABLE stock_adjustments
            ADD COLUMN IF NOT EXISTS item_name VARCHAR(200);
        ALTER TABLE stock_adjustments
            ALTER COLUMN item_id DROP NOT NULL;

        -- Add item_name to cycle_count_items
        ALTER TABLE cycle_count_items
            ADD COLUMN IF NOT EXISTS item_name VARCHAR(200);
        ALTER TABLE cycle_count_items
            ALTER COLUMN item_id DROP NOT NULL;

        -- Update item_type column sizes
        ALTER TABLE purchase_order_items
            ALTER COLUMN item_type TYPE VARCHAR(50);
        ALTER TABLE grn_items
            ALTER COLUMN item_type TYPE VARCHAR(50);
        ALTER TABLE stock_movements
            ALTER COLUMN item_type TYPE VARCHAR(50);
        ALTER TABLE stock_adjustments
            ALTER COLUMN item_type TYPE VARCHAR(50);
        ALTER TABLE cycle_count_items
            ALTER COLUMN item_type TYPE VARCHAR(50);
        """
        
        print("\nExecuting migration SQL...")
        conn.execute(text(migration_sql))
        conn.commit()
        
        print("\n✓ Migration completed successfully!")
        
        conn.close()
        
    except Exception as e:
        print(f"\n✗ Migration failed: {e}")
        raise

if __name__ == "__main__":
    run_migration()
