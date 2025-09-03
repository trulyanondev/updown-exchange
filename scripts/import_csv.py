import csv

# Input CSV file
csv_file = "token_info.txt"

# Output file for SQL values
sql_file = "tokens_insert.sql"

rows = []
with open(csv_file, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        symbol = row["symbol"].strip()
        network = row["network"].strip()
        contract_address = row["contract_address"].strip()
        # Escape single quotes if they exist
        symbol = symbol.replace("'", "''")
        network = network.replace("'", "''")
        contract_address = contract_address.replace("'", "''")

        if contract_address == "N/A":
            contract_address = "NULL"
        else:
            contract_address = f"'{contract_address}'"
        rows.append(f"('{symbol}','{network}',{contract_address})")

# Join all rows with commas + newline for readability
values_sql = ",\n  ".join(rows)

# Build the final SQL string
sql = f"""insert into tokens (symbol, network, contract_address)
values
  {values_sql}
;
"""

# Write to file
with open(sql_file, "w", encoding="utf-8") as f:
    f.write(sql)

print(f"SQL insert statements written to {sql_file}")
