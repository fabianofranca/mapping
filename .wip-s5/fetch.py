import json,os,subprocess,sys
S=os.path.dirname(os.path.abspath(__file__))
rows=json.load(open(S+'/rows.json'))
REF='5113b82a4ed6416d6344efa50e41db8cb65928ff'
os.makedirs(S+'/src',exist_ok=True)
for p in sorted({r[2] for r in rows}):
    out=S+'/src/'+p.split('/')[-1]
    if not os.path.exists(out):
        url=f'https://raw.githubusercontent.com/androidx/androidx/{REF}/{p}'
        r=subprocess.run(['curl','-sS','-m','60','-f','-o',out,url],capture_output=True,text=True)
        print(p.split('/')[-1], r.returncode, r.stderr.strip()[:80])
