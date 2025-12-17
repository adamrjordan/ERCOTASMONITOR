import requests
import pandas as pd
import datetime
import os
import pytz  # NEW: For robust timezone handling

# URL for the ERCOT Ancillary Service Capacity Monitor API
URL = "https://www.ercot.com/api/1/services/read/dashboards/ancillary-service-capacity-monitor"
DATA_FILE = "ercot_ancillary_data.csv"

def fetch_data():
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    try:
        response = requests.get(URL, headers=headers, timeout=30)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Error fetching data: {e}")
        return None

def deep_flatten(obj, prefix=''):
    items = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k.lower() in ['dictionary', 'color', 'style', 'order', 'timestamp']: 
                continue
            new_prefix = f"{prefix}_{k}" if prefix else k
            items.update(deep_flatten(v, new_prefix))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            item_name = str(i)
            if isinstance(v, dict):
                item_name = v.get('name') or v.get('type') or v.get('label') or str(i)
            
            # Clean up the key name to match the previous CSV format (1_1 instead of 1_1_1 if possible)
            clean_name = str(item_name).replace(' ', '_').replace('/', '_')
            
            # Special handling to avoid redundant nesting if the list is flat
            new_prefix = f"{prefix}_{clean_name}"
            items.update(deep_flatten(v, new_prefix))
    elif isinstance(obj, (int, float)) and not isinstance(obj, bool):
        items[prefix] = obj
    return items

def process_data(json_data):
    if not json_data: return None
    
    # NEW: Generate Timestamp in Central Prevailing Time (CPT)
    # ERCOT is in America/Chicago timezone
    central = pytz.timezone('America/Chicago')
    now_central = datetime.datetime.now(central)
    
    flat_record = {
        'timestamp': now_central.isoformat()
    }
    
    raw_data = json_data.get('data', {})
    flattened_metrics = deep_flatten(raw_data)
    
    for k, v in flattened_metrics.items():
        clean_key = k.upper().replace('DATA_', '').replace('__', '_')
        flat_record[clean_key] = v
        
    return flat_record

def save_to_csv(record):
    if not record or len(record) < 5: 
        print("No valid metrics found.")
        return

    df = pd.DataFrame([record])
    
    if not os.path.exists(DATA_FILE):
        df.to_csv(DATA_FILE, index=False)
        print(f"Created {DATA_FILE} with {len(record)} columns.")
    else:
        try:
            existing_df = pd.read_csv(DATA_FILE)
            updated_df = pd.concat([existing_df, df], ignore_index=True)
            updated_df.to_csv(DATA_FILE, index=False)
            print(f"Appended data. Total rows: {len(updated_df)}")
        except Exception as e:
            print(f"CSV Error: {e}. Overwriting.")
            df.to_csv(DATA_FILE, index=False)

def main():
    print("Running CPT Scraper...")
    json_data = fetch_data()
    if json_data:
        record = process_data(json_data)
        print(f"Timestamp: {record['timestamp']}")
        save_to_csv(record)
    else:
        exit(1)

if __name__ == "__main__":
    main()
