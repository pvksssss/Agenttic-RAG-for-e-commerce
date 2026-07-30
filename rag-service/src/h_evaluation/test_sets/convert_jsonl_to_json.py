import json
import os
import sys

def convert_json_to_jsonl(json_path=None, jsonl_path=None):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')

    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    if json_path is None:
        json_path = os.path.join(base_dir, "ecommerce_benchmark_20each.json")
    if jsonl_path is None:
        jsonl_path = os.path.join(base_dir, "ecommerce_benchmark_20each.jsonl")

    print(f"Reading JSON from: {json_path}")
    with open(json_path, "r", encoding="utf-8") as f:
        records = json.load(f)

    print(f"Total records read: {len(records)}")

    print(f"Writing JSONL to: {jsonl_path}")
    with open(jsonl_path, "w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(f"Successfully converted {len(records)} records to {os.path.basename(jsonl_path)}!")

def convert_jsonl_to_json(jsonl_path=None, json_path=None):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')

    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    if jsonl_path is None:
        jsonl_path = os.path.join(base_dir, "ecommerce_benchmark_20each.jsonl")
    if json_path is None:
        json_path = os.path.join(base_dir, "ecommerce_benchmark_20each.json")

    print(f"Reading JSONL from: {jsonl_path}")
    records = []
    with open(jsonl_path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line_str = line.strip()
            if line_str:
                try:
                    records.append(json.loads(line_str))
                except json.JSONDecodeError as e:
                    print(f"Warning: Line {line_num} is not valid JSON: {e}")

    print(f"Total records read: {len(records)}")

    print(f"Writing formatted JSON to: {json_path}")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    print(f"Successfully converted {len(records)} records to {os.path.basename(json_path)}!")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--to-json":
        convert_jsonl_to_json()
    else:
        # Default: Convert JSON back to JSONL
        convert_json_to_jsonl()
