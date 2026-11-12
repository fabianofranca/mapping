# prepara o pacote (cópia ou real): fieldModels, formatVersion 16 e o ignore de cada code/caso; depois importall.py
import json,os,re,sys
S=os.path.dirname(os.path.abspath(__file__))
target=sys.argv[1]
f=target+'/material3-compose.spec.json'
subprocess=__import__('subprocess')
subprocess.run(['python3',S+'/setmodels.py',f,S+'/models.json'],check=True)
s=json.load(open(f))
def norm(x): return re.sub(r'[^a-z0-9]','',x.lower())
SLOT={'@Composable () -> Unit','(@Composable () -> Unit)?'}
for l in s['layers']:
    for t in l['annotationTypes']:
        code=t['code']['compose']
        keys={norm(x['key']) for x in t['fields']}
        linked={norm(v.split('.')[-1]) for v in (code.get('params') or {}).values()}
        for c in (code.get('variants') or {}).get('cases',{}).values():
            linked|={norm(v.split('.')[-1]) for v in (c.get('params') or {}).values()}
        def ignore_for(rid):
            sig=json.load(open(f'{S}/out/{rid}.json'))
            out=[]
            for p in sig['params']:
                n=p['name']
                if p['role'] in('modifier',) or n=='interactionSource': out.append(n)
                elif p['role']=='slot' and p['type'] in SLOT and n!='subtitle' and norm(n) not in keys and norm(n) not in linked: out.append(n)
            return out
        ig=ignore_for(t['id'])
        if ig: code['ignore']=ig
        for case,c in (code.get('variants') or {}).get('cases',{}).items():
            ig=ignore_for(t['id']+'.'+case)
            if ig: c['ignore']=ig
json.dump(s,open(f,'w'),ensure_ascii=False,indent=2); open(f,'a').write('\n')
