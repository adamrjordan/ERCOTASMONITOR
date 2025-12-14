import requests
import pandas as pd
import datetime
import os
import json

# URL for the ERCOT Ancillary Service Capacity Monitor API
URL = "https://www.ercot.com/api/1/services/read/dashboards/ancillary-service-capacity-monitor"

# File path for storing data
DATA_FILE = "ercot_ancillary_data.csv"

def fetch_data():
    """Fetches JSON data from the ERCOT API."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    
    try:
        response = requests.get(URL, headers=headers, timeout=30)
        response.raise_for_status()
        
        if not response.text.strip():
            print("Error: API response body is empty.")
            return None
            
        return response.json()
    except Exception as e:
        print(f"Error during API request/parsing: {e}")
        return None

def deep_flatten(dictionary, parent_key='', separator='_'):
    """Recursively flattens a nested dictionary and list structure, ignoring metadata."""
    items = []
    
    if not isinstance(dictionary, dict):
        return {}

    for key, value in dictionary.items():
        # 1. IMPROVEMENT: Skip metadata keys that cause garbage columns
        if key.lower() in ['columns', 'column', 'headers', 'header', 'definitions', 'meta', 'types']:
            continue

        # Sanitize the key for the column name
        new_key = parent_key + separator + key if parent_key else key
        new_key_clean = new_key.replace(" ", "_").replace(":", "_").replace(".", "_").replace("-", "_").upper()
        
        if isinstance(value, list):
            # Check for list of [key, value] pairs (The ERCOT Dashboard format)
            is_key_value_list = all(isinstance(item, list) and len(item) == 2 and isinstance(item[0], str) for item in value)

            if is_key_value_list:
                for item_list in value:
                    field_name = item_list[0].replace(" ", "_").replace("-", "_").upper()
                    final_key = f"{new_key_clean}_{field_name}"
                    items.append((final_key, item_list[1]))
            
            # Check for list of dictionaries
            elif all(isinstance(item, dict) for item in value):
                for i, row in enumerate(value):
                    item_id = row.get('type') or row.get('service') or row.get('name') or row.get('label') or f"INDEX{i}"
                    item_prefix = f"{new_key_clean}_{item_id}".upper().replace(" ", "_")
                    items.extend(deep_flatten(row, item_prefix, separator=separator).items())
            
            else:
                 # Skip simple lists to avoid indexing garbage
                 continue
        
        elif isinstance(value, dict):
             items.extend(deep_flatten(value, new_key_clean, separator=separator).items())
        
        else:
            items.append((new_key_clean, value))
            
    return dict(items)

def filter_junk_data(record):
    """
    2. IMPROVEMENT: Scans the final record and removes any field 
    where the value is just a metadata string label like 'value' or 'type'.
    """
    clean_record = {}
    
    # Metadata strings we want to purge if they appear as data values
    garbage_values = {'value', 'key', 'name', 'type', 'label', 'string', 'number', 'boolean'}
    
    for key, value in record.items():
        # Keep timestamps
        if 'TIMESTAMP' in key or 'UPDATE' in key:
            clean_record[key] = value
            continue
            
        # If the value is a string, check if it's garbage
        if isinstance(value, str):
            if value.lower() in garbage_values:
                continue
            # If it's a list string representation, skip it
            if value.startswith('['):
                continue
                
        clean_record[key] = value
        
    return clean_record

def flatten_data(json_data):
    if not json_data:
        return None

    flat_record = {
        'scrape_timestamp_utc': datetime.datetime.utcnow().isoformat()
    }

    ercot_last_update = json_data.get('lastUpdate')
    if ercot_last_update:
        flat_record['ercot_last_update'] = ercot_last_update
    
    raw_data = json_data.get('data', {})
    
    # Flatten
    flattened = deep_flatten(raw_data, parent_key='DATA')
    
    # Update record
    flat_record.update(flattened)
    
    # Filter
    return filter_junk_data(flat_record)

def save_to_csv(record):
    if not record:
        return

    df_new_row = pd.DataFrame([record])

    if not os.path.exists(DATA_FILE):
        df_new_row.to_csv(DATA_FILE, index=False)
        print(f"Created {DATA_FILE} with {len(record)} columns.")
    else:
        try:
            # Read existing, but if it has way more columns (garbage), we might want to align to NEW schema
            existing_df = pd.read_csv(DATA_FILE)
            
            # Identify columns in the new row that aren't in the old file
            # If the old file is full of garbage, this append might still look messy until deleted
            updated_df = pd.concat([existing_df, df_new_row], ignore_index=True)
            
            updated_df.to_csv(DATA_FILE, index=False)
            print(f"Appended 1 row. Total rows: {len(updated_df)}")
        except Exception as e:
            print(f"Error appending: {e}. Overwriting file.")
            df_new_row.to_csv(DATA_FILE, index=False)

def main():
    print("Fetching ERCOT data...")
    json_data = fetch_data()
    
    if json_data:
        print("Data fetched successfully. Flattening...")
        flat_record = flatten_data(json_data)
        
        # We expect a good number of fields, but filtered of garbage
        if flat_record and len(flat_record) > 20: 
            print(f"Successfully captured {len(flat_record)} clean data fields.")
            print("Saving to CSV...")
            save_to_csv(flat_record)
            print("Done.")
        else:
            print(f"Extraction failed: Only {len(flat_record)} fields found.")
            exit(1) 
    else:
        print("Failed to retrieve data.")
        exit(1)

if __name__ == "__main__":
    main()
