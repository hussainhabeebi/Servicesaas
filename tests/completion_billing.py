"""Exercise actual completion batch SQL against the full migrated SQLite schema."""
import re
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(':memory:')
for migration in sorted((root / 'packages/app/migrations').glob('*.sql')):
    db.executescript(migration.read_text())
source = (root / 'packages/app/src/lib/billing-on-completion.ts').read_text()
batch = source.split('await env.DB.batch([')[1].split(']);')[0]
statements = re.findall(r'prepare\("([^"]+)"\)', batch)
assert len(statements) == 5

def complete(booking, invoice, amount=100):
    with db:
        for sql, params in zip(statements, [
            (invoice, 'tenant', 'customer', invoice, 'AED'),
            ('visit:' + booking, 'tenant', invoice, 'Cleaning · 2026-10-25', amount, amount),
            (booking, 'tenant', 'customer', invoice, '2026-10-25', amount),
            (invoice, invoice, .05, invoice, .05, 'now', invoice),
            ('customer', 'tenant', 'now', 'customer', 'tenant'),
        ]):
            db.execute(sql, params)

complete('visit1', 'october')
complete('visit1', 'october')  # repeated completion must never charge twice
assert db.execute('SELECT COUNT(*) FROM service_completions').fetchone()[0] == 1
assert db.execute('SELECT total FROM invoices').fetchone()[0] == 105
complete('visit2', 'october', 200)
assert db.execute('SELECT subtotal, vat_amount, total FROM invoices').fetchone() == (300, 15, 315)
complete('visit3', 'november')
assert db.execute('SELECT COUNT(*) FROM invoices').fetchone()[0] == 2
assert db.execute('SELECT COUNT(*) FROM invoice_line_items').fetchone()[0] == 3
print('PASS: migrations, duplicate completion, cycle accumulation, VAT, separate periods')
