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
    """Recursively flattens a nested dictionary and list structure."""
    items = []
    
    if not isinstance(dictionary, dict):
        return {}

    for key, value in dictionary.items():
        # Sanitize the key for the column name
        new_key = parent_key + separator + key if parent_key else key
        # Use only upper case letters and underscores for column names
        new_key_clean = new_key.replace(" ", "_").replace(":", "_").replace(".", "_").replace("-", "_").upper()
        
        if isinstance(value, list):
            
            # 1. CRITICAL FIX: Check for list of [key, value] pairs (The ERCOT Dashboard format)
            # This is the most common format for the specific metrics
            is_key_value_list = all(isinstance(item, list) and len(item) == 2 and isinstance(item[0], str) for item in value)

            if is_key_value_list:
                # Use the field name (item[0]) as the final key part
                for item_list in value:
                    field_name = item_list[0].replace(" ", "_").replace("-", "_").upper()
                    final_key = f"{new_key_clean}_{field_name}"
                    items.append((final_key, item_list[1]))
            
            # 2. Standard: Check for list of dictionaries (like AS product rows, e.g., 'rows')
            elif all(isinstance(item, dict) for item in value):
                # Iterate through each item, trying to find a unique identifier
                for i, row in enumerate(value):
                    # Prioritize descriptive keys (type, service, name, label)
                    item_id = row.get('type') or row.get('service') or row.get('name') or row.get('label') or f"INDEX{i}"
                    item_prefix = f"{new_key_clean}_{item_id}".upper().replace(" ", "_")
                    items.extend(deep_flatten(row, item_prefix, separator=separator).items())
            
            # 3. Fallback for simple lists (should be rare)
            else:
                 for i, item in enumerate(value):
                    items.append((f"{new_key_clean}_INDEX_{i}", item))
        
        elif isinstance(value, dict):
             # 4. Standard: Recurse into nested dictionary
             items.extend(deep_flatten(value, new_key_clean, separator=separator).items())
        
        else:
            # 5. Found a scalar value (int, float, string, bool)
            items.append((new_key_clean, value))
            
    return dict(items)


def flatten_data(json_data):
    """
    Sets up the initial record and calls the deep_flatten function 
    on the main data payload.
    """
    if not json_data:
        return None

    # Base record with scrape timestamp
    flat_record = {
        'scrape_timestamp_utc': datetime.datetime.utcnow().isoformat()
    }

    # Extract the timestamp from the data itself if present
    ercot_last_update = json_data.get('lastUpdate')
    if ercot_last_update:
        flat_record['ercot_last_update'] = ercot_last_update
    
    # We only want to flatten the key that contains all the actual dashboard metrics
    raw_data = json_data.get('data', {})
    
    # Extend the flat_record with all the extracted data
    # We flatten the raw_data block directly
    flat_record.update(deep_flatten(raw_data, parent_key='DATA'))

    return flat_record

def save_to_csv(record):
    """Saves the flattened data record to the CSV file, ensuring column alignment."""
    if not record:
        return

    df = pd.DataFrame([record])

    if not os.path.exists(DATA_FILE):
        # File doesn't exist, create it
        df.to_csv(DATA_FILE, index=False)
        print(f"Created {DATA_FILE} with {len(record)} columns.")
    else:
        # File exists, append new data
        try:
            existing_df = pd.read_csv(DATA_FILE)
            
            # Concatenate: pandas handles missing columns by filling with NaN
            updated_df = pd.concat([existing_df, df], ignore_index=True)
            
            # Write back the full dataset
            updated_df.to_csv(DATA_FILE, index=False)
            print(f"Appended data. Total rows: {len(updated_df)}")
        except Exception as e:
            # Catch file read/write errors (e.g., if the file was committed blank)
            print(f"Error appending to CSV: {e}. Writing new file with current record.")
            df.to_csv(DATA_FILE, index=False)


def main():
    print("Fetching ERCOT data...")
    json_data = fetch_data()
    
    if json_data:
        print("Data fetched successfully. Flattening...")
        flat_record = flatten_data(json_data)
        
        # Check for substantial data (more than just the 2 timestamp fields)
        # Using a confidence threshold of at least 5 meaningful data points
        if flat_record and len(flat_record) > 5: 
            print(f"Successfully captured {len(flat_record)} fields.")
            print("Saving to CSV...")
            save_to_csv(flat_record)
            print("Done.")
        else:
            print(f"Extraction failed: Only {len(flat_record)} fields found (expected > 5).")
            # CRITICAL: Exit with an error code to prevent GitHub from committing a blank/incomplete row.
            exit(1) 
    else:
        print("Failed to retrieve data. Check API availability or logs above.")
        exit(1)

if __name__ == "__main__":
    main()


