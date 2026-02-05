import base64

def split_str(s, n):
    return [s[i:i+n] for i in range(0, len(s), n)]

with open('temp_google_oauth_fix.ts', 'rb') as f:
    encoded = base64.b64encode(f.read()).decode('utf-8')

chunks = split_str(encoded, 150) # Smaller chunks for safety

print(f"Total chunks: {len(chunks)}")
for i, chunk in enumerate(chunks):
    print(f"echo -n '{chunk}' >> /tmp/b64_full")
