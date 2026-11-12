# edita os templates (button, surface, radio-button, switch) para ler os campos importados
import json,copy
D='/home/user/mapping/libraries/material3-compose/components/'
def load(n): return json.load(open(D+n+'.json'))
def save(n,t): json.dump(t,open(D+n+'.json','w'),ensure_ascii=False,indent=2); open(D+n+'.json','a').write('\n')
COLORS=None
dv=load('divider')
def find(n,pred,acc):
    if isinstance(n,dict):
        if pred(n): acc.append(n)
        for c in n.get('children') or []: find(c,pred,acc)
a=[];find(dv['template'],lambda n:n.get('name')=='linha',a)
COLORS=a[0]['fill']['cases']
def SW(field,old): return {"$switch":field,"cases":copy.deepcopy(COLORS),"default":old}
def nodes(t,name,typ=None):
    a=[];find(t['template'],lambda n:n.get('name')==name and (typ is None or n.get('type')==typ),a);return a
DIS={"$eq":["enabled","false"]}
# ---- top-app-bar
t=load('top-app-bar')
r=t['template']
r['fill']=SW('containerColor',r['fill'])
for n in nodes(t,'título','text')+nodes(t,'título centralizado','text')+nodes(t,'título grande','text'):
    n['color']=SW('titleContentColor',n['color'])
nav=nodes(t,'navegação','frame')[0]
for i in nav['children']:
    if i.get('type')=='icon': i['color']=SW('navigationIconContentColor',i['color'])
for nm in ['ação 1','ação 2']:
    for i in nodes(t,nm,'frame')[0]['children']:
        if i.get('type')=='icon': i['color']=SW('actionIconContentColor',i['color'])
cx=nodes(t,'título (caixa)','frame')[0]
title=cx['children'][0]
SUB={"$has":"subtitle"}
cx['layout']['type']={"$if":SUB,"then":"column","else":"row"}
cx['layout']['justify']='center'
title['height']={"$if":SUB,"then":"hug","else":"fill"}
sub=copy.deepcopy(title)
sub['name']='subtítulo'
sub['text']={"$field":"subtitle"}
sub['height']='hug'
sub['visible']=SUB
sub['color']=SW('subtitleContentColor',{"$token":"on-surface-variant"})
for k,v in list(sub['font'].items()):
    if isinstance(v,dict) and '$token' in v: sub['font'][k]={"$token":v['$token'].replace('title-large','label-medium')}
cx['children'].append(sub)
save('top-app-bar',t)
