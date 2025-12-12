import requests
import pandas as pd
import datetime
import os
import json

# URL for the ERCOT Ancillary Service Capacity Monitor API
# This endpoint returns JSON data used to populate the dashboard
URL = "https://www.ercot.com/api/1/services/read/dashboards/ancillary-service-capacity-monitor"

# File path for storing data
DATA_FILE = "ercot_ancillary_data.csv"

def fetch_data():
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    
    try:
        response = requests.get(URL, headers=headers, timeout=30)
        response.raise_for_status()
        data = response.json()
        return data
    except Exception as e:
        print(f"Error fetching data: {e}")
        return None

def flatten_data(json_data):
    """
    Flattens the nested ERCOT JSON structure into a single dictionary (row).
    This ensures we capture ALL fields, including specific HSL capacities.
    """
    if not json_data or 'data' not in json_data:
        return None

    # Base record with timestamp of the scrape (UTC)
    flat_record = {
        'scrape_timestamp_utc': datetime.datetime.utcnow().isoformat()
    }

    # Extract the timestamp from the data itself if available
    if 'lastUpdate' in json_data:
        flat_record['ercot_last_update'] = json_data['lastUpdate']

    # The 'data' key usually contains the list of AS products and System metrics
    # We iterate through everything to ensure we miss nothing (RTC+B updates friendly)
    raw_data = json_data.get('data', {})

    # 1. Handle System Level Metrics (PRC, etc.) which might be at the root of 'data' or in a list
    # The structure often varies, so we iterate generic keys first
    for key, value in raw_data.items():
        if isinstance(value, (int, float, str)):
            flat_record[f"system_{key}"] = value

    # 2. Handle Lists (Usually the AS types: RegUp, RegDown, RRS, ECRS, NonSpin)
    # The API often returns a list of objects, each representing a row in the dashboard table
    if 'rows' in raw_data and isinstance(raw_data['rows'], list):
        for row in raw_data['rows']:
            # The 'dictionary' key usually holds the name of the AS Type (e.g., 'REGUP', 'RRS')
            # Or it might be labeled 'type'. We try to find a unique identifier.
            row_id = row.get('type') or row.get('service') or row.get('name') or "Unknown"
            
            # Clean up the ID
            row_id = str(row_id).replace(" ", "_").upper()

            for k, v in row.items():
                if k not in ['type', 'service', 'name']: # Skip the ID itself
                    # Create column name: TYPE_FIELD (e.g., REGUP_RESPONSIBILITY)
                    col_name = f"{row_id}_{k}".replace(" ", "_").upper()
                    flat_record[col_name] = v
    
    # 3. Handle 'totals' or specific aggregates if they exist separately
    # ERCOT sometimes puts the "Telemetered HSL... OUT" fields in a separate 'aggregations' block
    if 'aggregations' in raw_data:
        for k, v in raw_data['aggregations'].items():
            flat_record[f"AGG_{k}".replace(" ", "_").upper()] = v

    return flat_record

def save_to_csv(record):
    if not record:
        return

    df = pd.DataFrame([record])

    # Check if file exists to determine if we need to write headers
    if not os.path.exists(DATA_FILE):
        df.to_csv(DATA_FILE, index=False)
        print(f"Created {DATA_FILE} with {len(record)} columns.")
    else:
        # Load existing data to align columns (in case ERCOT adds new fields mid-stream)
        existing_df = pd.read_csv(DATA_FILE)
        
        # Combine ensures that if new columns appear, they are added (filled with NaN for old rows)
        updated_df = pd.concat([existing_df, df], ignore_index=True)
        
        updated_df.to_csv(DATA_FILE, index=False)
        print(f"Appended data. Total rows: {len(updated_df)}")

def main():
    print("Fetching ERCOT data...")
    json_data = fetch_data()
    
    if json_data:
        print("Data fetched successfully. Flattening...")
        flat_record = flatten_data(json_data)
        
        # Debug: Print fields count
        print(f"Fields captured: {len(flat_record)}")
        
        print("Saving to CSV...")
        save_to_csv(flat_record)
        print("Done.")
    else:
        print("Failed to retrieve data.")
        exit(1)

if __name__ == "__main__":
    main()