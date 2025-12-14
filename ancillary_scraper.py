import requests
import pandas as pd
import datetime
import os
import re

# URL for the ERCOT Ancillary Service Capacity Monitor API
URL = "https://www.ercot.com/api/1/services/read/dashboards/ancillary-service-capacity-monitor"
DATA_FILE = "ercot_ancillary_data.csv"

# Mapping ERCOT's long internal names to Short, Readable Prefixes
GROUP_MAPPING = {
    "responsiveReserveCapabilityGroup": "RRS_CAP",
    "responsiveReserveAwardsGroup": "RRS_AWARD",
    "ercotContingencyReserveCapabilityGroup": "ECRS_CAP",
    "ercotContingencyReserveAwardsGroup": "ECRS_AWARD",
    "nonSpinReserveCapabilityGroup": "NONSPIN_CAP",
    "nonSpinReserveAwardsGroup": "NONSPIN_AWARD",
    "regulationServiceCapabilityGroup": "REG_CAP",
    "regulationServiceAwardsGroup": "REG_AWARD",
    "system": "SYS",
    "prcMetrics": "PRC"
}

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

def process_metrics(data_block):
    """
    Extracts only numeric metrics from known groups and renames them.
    """
    flat_record = {
        'timestamp': datetime.datetime.utcnow().isoformat()
    }
    
    # 1. Handle Top Level fields (like lastUpdate)
    if 'lastUpdate' in data_block:
        flat_record['ercot_last_update'] = data_block['lastUpdate']

    raw_data = data_block.get('data', {})

    # 2. Iterate only through the dictionary keys in the data block
    for group_key, group_data in raw_data.items():
        
        # Check if this is a group we care about (in our mapping)
        if group_key in GROUP_MAPPING:
            prefix = GROUP_MAPPING[group_key]
            
            # If it's a dictionary of metrics (Standard format)
            if isinstance(group_data, dict):
                for metric_key, val in group_data.items():
                    # STRICT FILTER: Only accept numbers. No strings, lists, or nulls.
                    if isinstance(val, (int, float)) and not isinstance(val, bool):
                        # Clean the metric name (e.g., 'rrsCapGen' -> 'GEN')
                        # We remove the prefix repetition if present
                        clean_metric = metric_key.upper()
                        
                        # Remove common redundancies to shorten headers
                        clean_metric = re.sub(r'RRS|ECRS|NONSPIN|REG|CAP|AWARD|METRICS', '', clean_metric)
                        
                        header = f"{prefix}_{clean_metric}".strip('_')
                        flat_record[header] = val
                        
            # If it's a list (sometimes ERCOT puts tuples like ['metric', value])
            elif isinstance(group_data, list):
                for item in group_data:
                    # Look for ['metricName', 123] pattern
                    if isinstance(item, list) and len(item) == 2 and isinstance(item[1], (int, float)):
                        key_name = str(item[0]).upper()
                        val = item[1]
                         # Remove redundancies
                        key_name = re.sub(r'RRS|ECRS|NONSPIN|REG|CAP|AWARD|METRICS', '', key_name)
                        
                        header = f"{prefix}_{key_name}".strip('_')
                        flat_record[header] = val

    return flat_record

def save_to_csv(record):
    if not record: return

    df = pd.DataFrame([record])
    
    if not os.path.exists(DATA_FILE):
        df.to_csv(DATA_FILE, index=False)
        print(f"Created {DATA_FILE} with {len(record)} columns.")
    else:
        # Append logic
        try:
            existing_df = pd.read_csv(DATA_FILE)
            updated_df = pd.concat([existing_df, df], ignore_index=True)
            updated_df.to_csv(DATA_FILE, index=False)
            print(f"Appended data. Total rows: {len(updated_df)}")
        except Exception:
            # If CSV is broken/garbage, overwrite it
            print("Existing CSV was malformed. Overwriting.")
            df.to_csv(DATA_FILE, index=False)

def main():
    print("Running Clean Scraper...")
    json_data = fetch_data()
    if json_data:
        record = process_metrics(json_data)
        if len(record) > 5:
            save_to_csv(record)
            print("Success.")
        else:
            print("Error: No valid metrics found.")
            exit(1)
    else:
        exit(1)

if __name__ == "__main__":
    main()
