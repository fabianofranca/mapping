import json,sys
f=sys.argv[1]
s=json.load(open(f))
out={}
for k,v in s.items():
    if k=='fieldModels': continue
    out[k]=1 and (16 if k=='formatVersion' else v)
    if k=='platforms':
        out['fieldModels']=json.load(open(sys.argv[2]))
json.dump(out,open(f,'w'),ensure_ascii=False,indent=2); open(f,'a').write('\n')
