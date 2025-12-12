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
        data = response.json()
        return data
    except Exception as e:
        # Prints error to GitHub Actions log
        print(f"Error fetching data: {e}")
        return None

def flatten_data(json_data):
    """
    Flattens the nested ERCOT JSON structure into a single dictionary (row) 
    by aggressively iterating through all key-value pairs, including nested lists 
    and dictionaries, to capture all 60+ fields.
    """
    if not json_data:
        return None

    # Base record with timestamp of the scrape (UTC)
    flat_record = {
        'scrape_timestamp_utc': datetime.datetime.utcnow().isoformat()
    }

    # Extract the timestamp from the data itself
    if 'lastUpdate' in json_data:
        flat_record['ercot_last_update'] = json_data['lastUpdate']

    # We only care about the inner 'data' block
    raw_data = json_data.get('data', {})

    # Function to recursively process nested data
    def process_data_block(data_block, prefix=""):
        if not isinstance(data_block, dict):
            return
            
        for key, value in data_block.items():
            current_prefix = f"{prefix}_{key}" if prefix else key
            current_prefix_clean = current_prefix.replace(" ", "_").replace(":", "_").upper()
            
            if isinstance(value, (int, float, str, bool)):
                # Found a simple data point (e.g., PRC value)
                flat_record[current_prefix_clean] = value
                
            elif isinstance(value, dict):
                # Found a nested dictionary (e.g., an 'aggregation' block)
                process_data_block(value, current_prefix)
                
            elif isinstance(value, list) and all(isinstance(item, dict) for item in value):
                # Found a list of dictionaries (These are the AS product rows)
                
                # Iterate through each AS product row in the list
                for i, row in enumerate(value):
                    
                    # Try to find an identifier for the row (e.g., REGUP, RRS)
                    row_id = row.get('type') or row.get('service') or row.get('name') or f"ITEM_{i}"
                    row_id_clean = row_id.replace(" ", "_").replace(":", "_").upper()
                    
                    # Use the row's ID as the next prefix
                    for k, v in row.items():
                        # Skip keys used for identification
                        if k not in ['type', 'service', 'name']: 
                            col_name = f"{row_id_clean}_{k}".replace(" ", "_").upper()
                            flat_record[col_name] = v

    process_data_block(raw_data)

    # CRITICAL DEBUG CHECK
    # We expect more than just the two timestamp fields
    if len(flat_record) <= 2:
        print("Warning: Only timestamps were collected. The core data payload might be deeply nested or structured unexpectedly.")
    
    return flat_record

def save_to_csv(record):
    """Saves the flattened data record to the CSV file, ensuring column alignment."""
    if not record:
        return

    df = pd.DataFrame([record])

    if not os.path.exists(DATA_FILE):
        df.to_csv(DATA_FILE, index=False)
        print(f"Created {DATA_FILE} with {len(record)} columns.")
    else:
        # Load existing data to align columns
        existing_df = pd.read_csv(DATA_FILE)
        
        # Concatenate: pandas handles missing columns by filling with NaN
        updated_df = pd.concat([existing_df, df], ignore_index=True)
        
        updated_df.to_csv(DATA_FILE, index=False)
        print(f"Appended data. Total rows: {len(updated_df)}")

def main():
    print("Fetching ERCOT data...")
    json_data = fetch_data()
    
    if json_data:
        print("Data fetched successfully. Flattening...")
        flat_record = flatten_data(json_data)
        
        if flat_record and len(flat_record) > 2:
            print(f"Successfully captured {len(flat_record)} fields.")
            print("Saving to CSV...")
            save_to_csv(flat_record)
            print("Done.")
        else:
            print("Failed to extract data fields. Check API response structure.")
            exit(1)
    else:
        print("Failed to retrieve data.")
        exit(1)

if __name__ == "__main__":
    # Ensure all necessary firebase imports are available
    main()
