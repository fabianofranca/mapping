import json,sys
def walk(n,path,keys):
    if isinstance(n,dict):
        t=n.get('type'); nm=n.get('name')
        if t in('frame','rect','text','icon','ellipse','slot','image') :
            lab=f"{path}/{t}:{nm if isinstance(nm,str) else '(expr)'}"
            for k in keys:
                if k in n: print(' ',lab,k,'=',json.dumps(n[k],ensure_ascii=False)[:int(sys.argv[3]) if len(sys.argv)>3 else 260])
            for i,c in enumerate(n.get('children') or []): walk(c,lab,keys)
            if 'template' in n and isinstance(n['template'],dict): walk(n['template'],lab,keys)
t=json.load(open(sys.argv[1]))
walk(t['template'],'',sys.argv[2].split(','))
