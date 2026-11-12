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
# ---- button
t=load('button')
SHAPE={"$switch":"shape","cases":{"none":{"$token":"corner-none"},"extraSmall":{"$token":"corner-extra-small"},"small":{"$token":"corner-small"},"medium":{"$token":"corner-medium"},"large":{"$token":"corner-large"},"extraLarge":{"$token":"corner-extra-large"}},"default":{"$token":"corner-full"}}
for nm in ['sombra elevada','container','contorno','estado']:
    for n in nodes(t,nm,'rect'): n['cornerRadius']=copy.deepcopy(SHAPE)
c=nodes(t,'container','rect')[0]
f=c['fill']; assert f['$if']==DIS
f['then']=SW('disabledContainerColor',f['then']); f['else']=SW('containerColor',f['else'])
o=c['opacity']; assert o['$if']==DIS
o['then']={"$if":{"$has":"disabledContainerColor"},"then":1,"else":o['then']}
for n in nodes(t,'rótulo','text')+[x for x in nodes(t,'conteúdo','frame')[0]['children'] if x.get('type')=='icon']:
    col=n['color']; assert col['$if']==DIS
    col['then']=SW('disabledContentColor',col['then']); col['else']=SW('contentColor',col['else'])
cont=nodes(t,'conteúdo','frame')[0]
old=cont['layout']['padding']
HAS={"$or":[{"$has":"horizontal"},{"$has":"vertical"}]}
H={"$field":"horizontal","default":24}
V={"$field":"vertical","default":8}
cont['layout']['padding']={"$if":HAS,"then":0,"else":old}
def spacer(name):
    return {"type":"frame","name":name,"visible":HAS,"width":{"$max":[0,{"$sub":[H,8]}]},"height":{"$add":[{"$mul":[V,2]},24]},"children":[]}
cont['children']=[spacer('recuo inicial')]+cont['children']+[spacer('recuo final')]
save('button',t)
# ---- surface
t=load('surface')
r=t['template']
E={"$field":"shadowElevation","default":0}
r['stroke']={"color":{"$if":{"$gt":[{"$field":"borderWidth","default":0},0]},"then":SW('borderColor',{"$token":"outline"}),"else":"none"},"width":{"$field":"borderWidth","default":0},"align":"inside"}
LV=[(0,2),(2,4),(4,7),(7,10),(10,None)]
shadows=[]
for i,(lo,hi) in enumerate(LV,1):
    cond=[{"$gt":[E,0]} if lo==0 else {"$gte":[E,lo]}]
    if hi is not None: cond.append({"$lt":[E,hi]})
    shadows.append({"type":"rect","name":f"sombra nível {i}","fill":copy.deepcopy(r['fill']),"cornerRadius":copy.deepcopy(r['cornerRadius']),
      "anchors":{"left":0,"right":0,"top":0,"bottom":0},"visible":{"$and":cond},
      "shadow":[{"color":{"$token":"elevation-point-shadow"},"y":{"$token":f"elevation-{i}-point-y"},"blur":{"$token":f"elevation-{i}-point-blur"},"spread":{"$token":f"elevation-{i}-point-spread"}},
                {"color":{"$token":"elevation-ambient-shadow"},"y":{"$token":f"elevation-{i}-ambient-y"},"blur":{"$token":f"elevation-{i}-ambient-blur"},"spread":{"$token":f"elevation-{i}-ambient-spread"}}]})
r['children']=shadows+r['children']
save('surface',t)
# ---- radio-button
t=load('radio-button')
def radio(n,key,sub=None):
    e=n[key] if sub is None else n[key][sub]
    assert e['$if']==DIS
    A=e['then']; B=e['else']['then']; C=e['else']['else']
    new={"$if":DIS,"then":{"$if":{"$field":"selected"},"then":SW('disabledSelectedColor',A),"else":SW('disabledUnselectedColor',A)},
         "else":{"$if":{"$field":"selected"},"then":SW('selectedColor',B),"else":SW('unselectedColor',C)}}
    if sub is None: n[key]=new
    else: n[key][sub]=new
radio(nodes(t,'anel','ellipse')[0],'stroke','color')
radio(nodes(t,'ponto','ellipse')[0],'fill')
save('radio-button',t)
# ---- switch
t=load('switch')
def sw4(n,key,sub,base):
    e=n[key] if sub is None else n[key][sub]
    # e: $if disabled then X else Y (X/Y podem depender de checked)
    D_=e['then']; En=e['else']
    def split(x):
        if isinstance(x,dict) and '$if' in x and x['$if']=={"$field":"checked"}: return x['then'],x['else']
        return x,x
    dc,du=split(D_); ec,eu=split(En)
    new={"$if":DIS,"then":{"$if":{"$field":"checked"},"then":SW('disabledChecked'+base,dc),"else":SW('disabledUnchecked'+base,du)},
         "else":{"$if":{"$field":"checked"},"then":SW('checked'+base,ec),"else":SW('unchecked'+base,eu)}}
    if sub is None: n[key]=new
    else: n[key][sub]=new
sw4(nodes(t,'trilho','rect')[0],'fill',None,'TrackColor')
sw4(nodes(t,'alça','ellipse')[0],'fill',None,'ThumbColor')
sw4(nodes(t,'contorno','rect')[0],'stroke','color','BorderColor')
save('switch',t)
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
