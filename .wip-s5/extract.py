import json,os,subprocess,sys
S=os.path.dirname(os.path.abspath(__file__))
rows=json.load(open(S+'/rows.json'))
REF='5113b82a4ed6416d6344efa50e41db8cb65928ff'
extra=json.load(open(S+'/flags.json')) if os.path.exists(S+'/flags.json') else {}
os.makedirs(S+'/out',exist_ok=True)
fails=0
for rid,sym,path,case in rows:
    name=sym.split('.')[-1]
    f=S+'/src/'+path.split('/')[-1]
    out=f"{S}/out/{rid}.json"
    cmd=['node','dist-mcp/mapping-signature.mjs','kotlin','--file',f,'--symbol',sym,'--path',path,'--ref',REF,'--out',out]
    for a in extra.get(rid,[]): cmd+=a if isinstance(a,list) else [a]
    r=subprocess.run(cmd,capture_output=True,text=True)
    if r.returncode!=0:
        fails+=1
        print('FAIL',rid,r.returncode,r.stderr.strip()[:300].replace('\n',' | '))
print('fails',fails,'of',len(rows))
