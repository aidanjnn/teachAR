"""Enter/rotate the server key without terminal echo, shell history, or source edits."""
import getpass
import os
from pathlib import Path
import sqlite3

root=Path(__file__).parent
key=getpass.getpass('OpenAI API key (hidden): ').strip()
if not key.startswith('sk-') or any(c.isspace() for c in key):
    raise SystemExit('Key format not recognized; nothing saved.')
folder=root/'.secrets';folder.mkdir(mode=0o700,exist_ok=True)
os.chmod(folder,0o700)
fd=os.open(folder/'openai.key',os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
with os.fdopen(fd,'w') as f:f.write(key)
os.chmod(folder/'openai.key',0o600)
# Rotation re-enables auth/quota-blocked checks, preserving every reservation.
ledger=root/'.runtime/ai-budget.sqlite3'
if ledger.exists():
    with sqlite3.connect(ledger) as db:db.execute("UPDATE calls SET status='error' WHERE status='blocked'")
print('Server key saved privately. Attempt count and budget preserved. No API request made.')
