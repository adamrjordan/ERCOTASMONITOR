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

def deep_flatten(dictionary, parent_key='', separator='_'):
    """Recursively flattens a nested dictionary and list structure."""
    items = []
    
    # Iterate over all items in the dictionary
    for key, value in dictionary.items():
        new_key = parent_key + separator + key if parent_key else key
        # Clean key for column name (e.g., remove spaces/colons)
        new_key_clean = new_key.replace(" ", "_").replace(":", "_").replace(".", "_").upper()
        
        if isinstance(value, dict):
            # Recurse into nested dictionary
            items.extend(deep_flatten(value, new_key_clean, separator=separator).items())
        elif isinstance(value, list):
            # Recurse into lists
            for i, item in enumerate(value):
                if isinstance(item, dict):
                    # Use a unique identifier for list items (like the AS product name)
                    item_id = item.get('type') or item.get('service') or item.get('name') or f"INDEX{i}"
                    item_prefix = f"{new_key_clean}_{item_id}".upper().replace(" ", "_")
                    items.extend(deep_flatten(item, item_prefix, separator=separator).items())
                else:
                    # Simple lists (treat as single values appended by index)
                    items.append((f"{new_key_clean}_{i}", item))
        else:
            # Found a scalar value (int, float, string, bool)
            items.append((new_key_clean, value))
            
    return dict(items)


def flatten_data(json_data):
    """
    Sets up the initial record and calls the deep_flatten function 
    on the main data payload.
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

    # CRITICAL: We pass the entire 'data' payload to the deep flattener
    raw_data = json_data.get('data', {})
    
    # Extend the flat_record with all the extracted data
    flat_record.update(deep_flatten(raw_data))

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
        
        # We expect more than 2 fields (scrape_timestamp_utc and ercot_last_update)
        if flat_record and len(flat_record) > 2:
            print(f"Successfully captured {len(flat_record)} fields.")
            print("Saving to CSV...")
            save_to_csv(flat_record)
            print("Done.")
        else:
            print(f"Failed to extract meaningful data fields. Only {len(flat_record)} fields found.")
            # If data extraction failed, we exit with error code 1 so the commit step is skipped.
            exit(1) 
    else:
        print("Failed to retrieve data.")
        exit(1)

if __name__ == "__main__":
    main()

