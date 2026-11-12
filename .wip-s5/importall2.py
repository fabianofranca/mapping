import json,os,subprocess,shutil,sys
S=os.path.dirname(os.path.abspath(__file__))
target=sys.argv[1]            # pasta do pacote (cópia ou a real)
rows=json.load(open(S+'/rows.json'))
specf=target+'/material3-compose.spec.json'
os.makedirs(target+'/signatures',exist_ok=True)
for rid,sym,path,case in rows:
    tid=rid.split('.')[0]
    name=f'{tid}.compose.json' if case is None else f'{tid}.{case}.compose.json'
    pass
report=[]
for rid,sym,path,case in rows:   # a base vem antes dos casos (ordem do rows.json)
    tid=rid.split('.')[0]
    name=f'{tid}.compose.json' if case is None else f'{tid}.{case}.compose.json'
    args={'path':target,'type':tid,'platform':'compose','signatureFile':f'{target}/signatures/{name}'}
    if case: args['variant']=case
    json.dump([{'name':'plan_signature_import','args':args}],open(S+'/call.json','w'))
    r=subprocess.run(['node',S+'/mcpcall.mjs',os.path.dirname(target),S+'/call.json',S+'/resp.json'],capture_output=True,text=True)
    resp=json.load(open(S+'/resp.json'))[0]
    if resp['isError']:
        print('ERRO',rid,resp['text'][:400]); continue
    d=json.loads(resp['text'])
    json.dump(d['spec'],open(specf,'w'),ensure_ascii=False,indent=2); open(specf,'a').write('\n')
    pend=[n for n in d['notices'] if n['kind']=='pending']
    other=[n for n in d['notices'] if n['kind']!='pending']
    report.append((rid,len(d['fields']),len(pend),[(n['kind'],n['message'][:110]) for n in other],d['versionBump']))
json.dump(report,open(S+'/report.json','w'),ensure_ascii=False)
print('ok',len(report))
