#!/usr/bin/env python3
"""
Generate a clean CSV for Google Sheets import from JustKraft scraped data.
- Excludes JustKraft URLs (product_url, image_url)
- Adds "Available in Store" column for client to tick
- Sorted by Top Category > Category > Name for easy browsing
"""

import csv
import os

INPUT_FILE = os.path.join(os.path.dirname(__file__), "justkraft-inventory", "justkraft_products.csv")
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "bhavani_crafts_inventory_checklist.csv")

# Columns to keep (excluding product_url, image_url, scrape_notes, variants, tags)
KEEP_COLUMNS = ["sku", "name", "category", "top_category", "category_path", "price", "currency", "stock_status"]

# Friendly header names for Google Sheets
HEADER_MAP = {
    "sku": "SKU",
    "name": "Product Name",
    "category": "Sub Category",
    "top_category": "Category",
    "category_path": "Full Category Path",
    "price": "Price (₹)",
    "currency": "Currency",
    "stock_status": "Online Stock Status",
}

def main():
    rows = []
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Skip junk/placeholder products (scraped page artifacts)
            name = row.get("name", "").strip()
            if not name or "JustKraft: Your Ultimate" in name:
                continue
            clean_row = {}
            for col in KEEP_COLUMNS:
                val = row.get(col, "").strip()
                # Clean up stock status display
                if col == "stock_status":
                    val = val.replace("_", " ").title()
                # Strip JustKraft branding from product names
                if col == "name":
                    for suffix in [" | JustKraft", " - JustKraft", " | justkraft", " - justkraft"]:
                        if val.lower().endswith(suffix.lower()):
                            val = val[:len(val) - len(suffix)].strip()
                            break
                clean_row[col] = val
            rows.append(clean_row)

    # Sort by Category > Sub Category > Product Name
    rows.sort(key=lambda r: (
        r.get("top_category", "").lower(),
        r.get("category", "").lower(),
        r.get("name", "").lower()
    ))

    # Write output CSV
    output_headers = [HEADER_MAP[c] for c in KEEP_COLUMNS]
    # Add the checkbox column and notes column
    output_headers.insert(0, "S.No")
    output_headers.append("Available in Store?")
    output_headers.append("Notes")

    with open(OUTPUT_FILE, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(output_headers)

        for i, row in enumerate(rows, start=1):
            values = [i]  # S.No
            for col in KEEP_COLUMNS:
                values.append(row[col])
            values.append("")  # Available in Store? (empty for client to fill)
            values.append("")  # Notes (empty for client to fill)
            writer.writerow(values)

    print(f"✅ Generated: {OUTPUT_FILE}")
    print(f"   Total products: {len(rows)}")
    print(f"   Columns: {', '.join(output_headers)}")
    print(f"\n📋 Next steps:")
    print(f"   1. Go to Google Sheets → https://sheets.google.com")
    print(f"   2. File → Import → Upload → Select '{os.path.basename(OUTPUT_FILE)}'")
    print(f"   3. Select the 'Available in Store?' column (column J)")
    print(f"   4. Data → Data validation → Checkbox  to add tick boxes")
    print(f"   5. Share the sheet with your client!")


if __name__ == "__main__":
    main()
