import json,copy
D='/home/user/mapping/libraries/material3-compose/components/'
for n in ['text-field','secure-text-field']:
    t=json.load(open(D+n+'.json'))
    a=[]
    def find(x):
        if isinstance(x,dict):
            if x.get('name')=='valor (recorte)': a.append(x)
            for c in x.get('children') or []: find(c)
    find(t['template'])
    if not a: print('sem recorte em',n); continue
    row=a[0]; val=row['children'][0]
    print(n,json.dumps({k:v for k,v in val.items() if k in('name','width','color','font','text')},ensure_ascii=False)[:500])
    pre=copy.deepcopy(val); pre['name']='prefixo'; pre['text']={"$field":"prefix"}; pre['width']='hug'; pre['visible']={"$has":"prefix"}
    suf=copy.deepcopy(val); suf['name']='sufixo'; suf['text']={"$field":"suffix"}; suf['width']='hug'; suf['visible']={"$has":"suffix"}
    row['children']=[pre]+row['children']+[suf]
    json.dump(t,open(D+n+'.json','w'),ensure_ascii=False,indent=2); open(D+n+'.json','a').write('\n')
